#!/usr/bin/env node
// ============================================================
// FinanceBro agent server: keeps WorkBuddy's agent engine running on
// an always-on machine (e.g. a SovernStack workspace) for the
// deployed app. Vercel's /api/chat forwards to it when
// AGENT_SERVER_URL is set.
//
//   POST /chat    Authorization: Bearer $AGENT_SERVER_SECRET
//                 {message, mode, sessionId?, mcpUrl, attachments?} → server-sent events
//   GET  /health  {ok, engine}
//
// Env: AGENT_SERVER_SECRET (required), PORT (8787), HOST (0.0.0.0),
// FINANCEBRO_MCP_URL (pins the tools URL; otherwise the caller's mcpUrl),
// MCP_TOKEN, MAX_CONCURRENT (3), WORKBUDDY_CLI_PATH.
//
// Needs Node 22.18+ (it imports the shared .ts files directly).
// ============================================================

import http from "node:http";
import { Readable } from "node:stream";
import { timingSafeEqual } from "node:crypto";
import { attachmentError, findEngine, isValidSessionId, runAgent } from "../src/lib/agent/runner.ts";
import { AGENT_INSTRUCTIONS } from "../src/lib/agent/instructions.ts";

const SECRET = process.env.AGENT_SERVER_SECRET ?? "";
const PORT = Number(process.env.PORT) || 8787;
const HOST = process.env.HOST || "0.0.0.0";
const MAX_CONCURRENT = Number(process.env.MAX_CONCURRENT) || 3;
const RUN_TIMEOUT_MS = 5 * 60_000;

if (SECRET.length < 16) {
  console.error("Set AGENT_SERVER_SECRET (16+ characters) before starting the agent server.");
  process.exit(1);
}
const engine = findEngine();
if (!engine) console.warn("WorkBuddy's agent engine (codebuddy) wasn't found. Install @tencent-ai/codebuddy-code or set WORKBUDDY_CLI_PATH.");

let running = 0;

function authorised(req) {
  const given = Buffer.from(req.headers.authorization ?? "");
  const expected = Buffer.from(`Bearer ${SECRET}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 10_000_000) throw new Error("Body too large"); // up to 3 receipts
  }
  return JSON.parse(raw);
}

const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url ?? "/", "http://localhost");

  if (req.method === "GET" && pathname === "/health") return json(res, 200, { ok: true, engine: !!engine, running });
  if (req.method !== "POST" || pathname !== "/chat") return json(res, 404, { error: "Not found" });
  if (!authorised(req)) return json(res, 401, { error: "Unauthorised" });
  if (!engine) return json(res, 503, { error: "agent_unavailable" });
  if (running >= MAX_CONCURRENT) return json(res, 429, { error: "Busy, try again in a moment" });

  let body;
  try {
    body = await readJson(req);
  } catch {
    return json(res, 400, { error: "Bad JSON" });
  }
  const hasAttachments = Array.isArray(body.attachments) && body.attachments.length > 0;
  const message = (typeof body.message === "string" ? body.message.trim() : "") || (hasAttachments ? "Here's my receipt. Please record it." : "");
  const mode = body.mode === "business" ? "business" : "individual";
  const mcpUrl = process.env.FINANCEBRO_MCP_URL || body.mcpUrl;
  if (!message || message.length > 8000) return json(res, 400, { error: "Bad message" });
  if (body.sessionId && !isValidSessionId(body.sessionId)) return json(res, 400, { error: "Bad session id" });
  if (typeof mcpUrl !== "string" || !/^https?:\/\//.test(mcpUrl)) return json(res, 400, { error: "Bad mcpUrl" });
  const badAttachments = attachmentError(body.attachments);
  if (badAttachments) return json(res, 400, { error: badAttachments });

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), RUN_TIMEOUT_MS);
  res.on("close", () => abort.abort());

  running++;
  const started = Date.now();
  res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" });
  const stream = runAgent({
    engine,
    message,
    mode,
    sessionId: body.sessionId,
    mcpUrl,
    mcpToken: process.env.MCP_TOKEN,
    instructions: AGENT_INSTRUCTIONS,
    attachments: body.attachments,
    signal: abort.signal,
  });
  Readable.fromWeb(stream)
    .on("end", () => {
      clearTimeout(timer);
      running--;
      console.log(`${new Date().toISOString()} ${mode} chat done in ${Math.round((Date.now() - started) / 1000)}s`);
    })
    .on("error", () => {
      clearTimeout(timer);
      running--;
    })
    .pipe(res);
});

server.listen(PORT, HOST, () => console.log(`FinanceBro agent server on http://${HOST}:${PORT} (engine: ${engine ?? "missing"})`));
