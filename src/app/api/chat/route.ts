// ============================================================
// FinanceBro AI chat, powered by WorkBuddy.
//
// With AGENT_SERVER_URL set (e.g. a SovernStack workspace running
// agent-server/server.mjs), the message is forwarded there. Otherwise
// WorkBuddy's agent engine runs on this machine. Either way the reply
// is a stream of server-sent events (see src/lib/agent/runner.ts),
// and the engine reaches FinanceBro's data through /api/mcp.
// ============================================================

import { AGENT_INSTRUCTIONS } from "@/lib/agent/instructions";
import { attachmentError, findEngine, isValidSessionId, runAgent, type Attachment } from "@/lib/agent/runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SSE_HEADERS = { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" };

export async function POST(request: Request) {
  let body: { message?: string; mode?: string; sessionId?: string; attachments?: Attachment[] };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Bad JSON" }, { status: 400 });
  }
  const badAttachments = attachmentError(body.attachments);
  if (badAttachments) return Response.json({ error: badAttachments }, { status: 400 });
  const attachments = body.attachments ?? [];
  // A receipt sent on its own still needs a message for the agent.
  const message = body.message?.trim() || (attachments.length ? "Here's my receipt. Please record it." : "");
  const mode = body.mode === "business" ? "business" : "individual";
  if (!message) return Response.json({ error: "Empty message" }, { status: 400 });
  if (message.length > 8000) return Response.json({ error: "Message too long" }, { status: 400 });
  if (body.sessionId && !isValidSessionId(body.sessionId)) return Response.json({ error: "Bad session id" }, { status: 400 });

  const mcpUrl = process.env.FINANCEBRO_MCP_URL || new URL("/api/mcp", request.url).toString();

  // Remote agent host.
  const remote = process.env.AGENT_SERVER_URL;
  if (remote) {
    try {
      const res = await fetch(new URL("/chat", remote), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.AGENT_SERVER_SECRET ?? ""}`,
          // Free ngrok domains otherwise answer some requests with a browser warning page.
          "ngrok-skip-browser-warning": "1",
        },
        body: JSON.stringify({ message, mode, sessionId: body.sessionId, mcpUrl, attachments }),
        signal: request.signal,
      });
      if (!res.ok || !res.body) {
        return Response.json({ error: "agent_unavailable", message: `Agent server answered ${res.status}.` }, { status: 503 });
      }
      return new Response(res.body, { headers: SSE_HEADERS });
    } catch (e) {
      return Response.json({ error: "agent_unavailable", message: `Agent server unreachable: ${e instanceof Error ? e.message : e}` }, { status: 503 });
    }
  }

  // Engine on this machine.
  const engine = findEngine();
  if (!engine) {
    return Response.json({ error: "agent_unavailable", message: "WorkBuddy's agent engine isn't installed where this server runs." }, { status: 503 });
  }
  const stream = runAgent({
    engine,
    message,
    mode,
    sessionId: body.sessionId,
    mcpUrl,
    mcpToken: process.env.MCP_TOKEN,
    instructions: AGENT_INSTRUCTIONS,
    attachments,
    signal: request.signal,
  });
  return new Response(stream, { headers: SSE_HEADERS });
}
