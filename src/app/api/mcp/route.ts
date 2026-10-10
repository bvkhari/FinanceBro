// ============================================================
// MCP server (Streamable HTTP, stateless, JSON responses) that
// gives WorkBuddy's agents FinanceBro's tools. Plain JSON-RPC 2.0:
// initialize, ping, tools/list, tools/call.
//
// Set MCP_TOKEN to require "Authorization: Bearer <token>"
// (or ?token=<token> for clients that can't send headers).
// ============================================================

import { TOOLS, callTool } from "@/lib/agent/tools";
import { AGENT_INSTRUCTIONS } from "@/lib/agent/instructions";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];

interface RpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

const ok = (id: RpcRequest["id"], result: unknown) => ({ jsonrpc: "2.0", id, result });
const fail = (id: RpcRequest["id"], code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

async function handle(req: RpcRequest) {
  switch (req.method) {
    case "initialize": {
      const asked = req.params?.protocolVersion as string | undefined;
      return ok(req.id, {
        protocolVersion: asked && PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "financebro", title: "FinanceBro AI", version: "1.0.0" },
        instructions: AGENT_INSTRUCTIONS,
      });
    }
    case "ping":
      return ok(req.id, {});
    case "tools/list":
      return ok(req.id, {
        tools: TOOLS.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
          annotations: { readOnlyHint: !t.write, destructiveHint: false, idempotentHint: !t.write },
        })),
      });
    case "tools/call": {
      const name = req.params?.name;
      if (typeof name !== "string") return fail(req.id, -32602, "params.name is required");
      const result = await callTool(name, (req.params?.arguments as Record<string, unknown>) ?? {});
      return ok(req.id, { content: [{ type: "text", text: result.text }], isError: !result.ok });
    }
    default:
      return fail(req.id, -32601, `Method not found: ${req.method}`);
  }
}

function authorised(request: Request) {
  const token = process.env.MCP_TOKEN;
  if (!token) return true;
  const header = request.headers.get("authorization");
  return header === `Bearer ${token}` || new URL(request.url).searchParams.get("token") === token;
}

export async function POST(request: Request) {
  if (!authorised(request)) return Response.json(fail(null, -32001, "Unauthorised"), { status: 401 });

  let body: RpcRequest | RpcRequest[];
  try {
    body = await request.json();
  } catch {
    return Response.json(fail(null, -32700, "Parse error"), { status: 400 });
  }

  const batch = Array.isArray(body) ? body : [body];
  // Notifications (no id) get no reply.
  const replies = await Promise.all(batch.filter((r) => r.id !== undefined && r.id !== null).map(handle));
  if (replies.length === 0) return new Response(null, { status: 202 });
  return Response.json(Array.isArray(body) ? replies : replies[0]);
}

// Stateless server: no server-to-client stream and no sessions to end.
export function GET() {
  return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
}

export function DELETE() {
  return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
}
