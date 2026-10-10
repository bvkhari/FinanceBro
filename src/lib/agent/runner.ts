// ============================================================
// Runs WorkBuddy's agent engine (the CodeBuddy CLI) headless for
// one chat message, with only FinanceBro's MCP tools, and turns
// its stream-json output into server-sent events:
//   {type:"session", sessionId}
//   {type:"step", id, tool, status:"active"|"done"|"error"}
//   {type:"done", reply, sessionId}
//   {type:"error", code:"not_signed_in"|"agent_failed", message}
//
// Used by /api/chat (on a machine with the engine) and by
// agent-server/server.mjs (an always-on host). The server runs it
// through Node's type stripping, so: node builtins only, no
// path aliases, no enums.
// ============================================================

import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const MCP_PREFIX = "mcp__financebro__";
const SIGN_IN = /authenticat|\/login|sign in/i;
const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9:_-]{0,99}$/;

export type AgentMode = "individual" | "business";

/**
 * WorkBuddy's agent engine. An npm install (@tencent-ai/codebuddy-code) comes before the copy
 * bundled in the WorkBuddy app: that copy is headless-only and can't run /login.
 */
export function findEngine(): string | null {
  const candidates = [
    process.env.WORKBUDDY_CLI_PATH,
    "/opt/homebrew/bin/codebuddy",
    "/usr/local/bin/codebuddy",
    join(process.env.HOME ?? "", ".local", "bin", "codebuddy"),
    join(process.env.HOME ?? "", ".npm-global", "bin", "codebuddy"),
    "/usr/bin/codebuddy",
    "/Applications/WorkBuddy AI.app/Contents/Resources/app.asar.unpacked/cli/bin/codebuddy",
  ];
  return candidates.find((p): p is string => !!p && existsSync(p)) ?? null;
}

export const isValidSessionId = (id: string) => SESSION_ID.test(id);

const PROFILE_NOTE: Record<AgentMode, string> = {
  individual: "The user is in the app's Personal profile: use mode \"individual\" in every tool call unless they ask about the business.",
  business: "The user is in the app's Business profile: use mode \"business\" in every tool call unless they ask about their personal account.",
};

const CHAT_STYLE = `You are replying inside the FinanceBro AI chat in the app. Write plain text for a phone screen: short paragraphs, "-" bullets, no markdown headings, tables or bold. You have no tools other than the financebro ones.`;

export function runAgent(opts: {
  engine: string;
  message: string;
  mode: AgentMode;
  sessionId?: string;
  mcpUrl: string;
  mcpToken?: string;
  instructions: string;
  signal?: AbortSignal;
}): ReadableStream<Uint8Array> {
  const mcpConfig = JSON.stringify({
    mcpServers: {
      financebro: {
        type: "http",
        url: opts.mcpUrl,
        ...(opts.mcpToken ? { headers: { Authorization: `Bearer ${opts.mcpToken}` } } : {}),
      },
    },
  });

  // The agent gets an empty working folder.
  const cwd = join(tmpdir(), "financebro-agent");
  mkdirSync(cwd, { recursive: true });

  const sessionId = opts.sessionId ?? randomUUID();
  const args = [
    "-p", opts.message,
    "--output-format", "stream-json",
    "--verbose",
    // Locked down three ways: one harmless built-in tool (an empty --tools is ignored), only the
    // financebro tools pre-approved, and dontAsk denies anything else that needs approval.
    "--tools", "AskUserQuestion",
    "--mcp-config", mcpConfig,
    "--strict-mcp-config",
    "--allowedTools", "mcp__financebro",
    "--disallowedTools", "Agent,Read,Write,Edit,Bash,PowerShell,Glob,Grep,NotebookEdit,WebFetch,WebSearch,Skill,SkillManage,ComputerUse,Workflow,REPL,Monitor,LSP",
    "--permission-mode", "dontAsk",
    "--max-turns", "25",
    "--append-system-prompt", `${opts.instructions}\n\n${PROFILE_NOTE[opts.mode]}\n\n${CHAT_STYLE}`,
    ...(opts.sessionId ? ["--resume", sessionId] : ["--session-id", sessionId]),
  ];

  const child = spawn(opts.engine, args, {
    cwd,
    env: {
      ...process.env,
      CODEBUDDY_WAIT_FOR_MCP_SERVERS_ENABLED: "1",
      // Load the financebro tools up front instead of behind a tool search the model may skip.
      CODEBUDDY_DEFER_TOOL_LOADING: "false",
      CODEBUDDY_DISABLE_AUTO_MEMORY: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      let closed = false;
      const send = (event: Record<string, unknown>) => {
        if (!closed) controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      const finish = () => {
        if (!closed) {
          closed = true;
          controller.close();
        }
      };

      send({ type: "session", sessionId });

      let buffer = "";
      let stderr = "";
      let gotResult = false;
      const toolNames = new Map<string, string>();

      const handleLine = (line: string) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let msg: any;
        try {
          msg = JSON.parse(line);
        } catch {
          // Plain-text output (e.g. a sign-in prompt) is kept for the error message.
          stderr += `${line}\n`;
          return;
        }
        if (msg.type === "assistant") {
          for (const block of msg.message?.content ?? []) {
            if (block.type === "tool_use") {
              const tool = String(block.name ?? "").replace(MCP_PREFIX, "");
              toolNames.set(block.id, tool);
              send({ type: "step", id: block.id, tool, status: "active" });
            }
          }
        } else if (msg.type === "user") {
          const content = msg.message?.content;
          for (const block of Array.isArray(content) ? content : []) {
            if (block.type === "tool_result") {
              send({ type: "step", id: block.tool_use_id, tool: toolNames.get(block.tool_use_id), status: block.is_error ? "error" : "done" });
            }
          }
        } else if (msg.type === "result") {
          gotResult = true;
          if (msg.subtype === "success" && !msg.is_error) {
            send({ type: "done", reply: String(msg.result ?? "").trim(), sessionId: msg.session_id ?? sessionId });
          } else {
            const text = (msg.errors ?? []).join("; ") || String(msg.result ?? "") || `The agent stopped (${msg.subtype}).`;
            send({ type: "error", code: SIGN_IN.test(text) ? "not_signed_in" : "agent_failed", message: text });
          }
        }
      };

      child.stdout.on("data", (chunk: Buffer) => {
        buffer += chunk.toString("utf8");
        let nl: number;
        while ((nl = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (line) handleLine(line);
        }
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf8");
      });
      child.on("error", (e) => {
        send({ type: "error", code: "agent_failed", message: `Couldn't start WorkBuddy's agent: ${e.message}` });
        finish();
      });
      child.on("close", () => {
        if (buffer.trim()) handleLine(buffer.trim());
        if (!gotResult) {
          const signIn = SIGN_IN.test(stderr);
          send({
            type: "error",
            code: signIn ? "not_signed_in" : "agent_failed",
            message: signIn
              ? "WorkBuddy's agent isn't signed in on the machine running it."
              : stderr.trim().split("\n").slice(-3).join(" ") || "The agent ended without a reply.",
          });
        }
        finish();
      });

      opts.signal?.addEventListener("abort", () => {
        child.kill();
        finish();
      });
    },
    cancel() {
      child.kill();
    },
  });
}
