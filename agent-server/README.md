# FinanceBro agent server

This server keeps the **CodeBuddy / WorkBuddy agent engine** running on an always-on machine, so the deployed app's FinanceBro AI chat works without your laptop. CodeBuddy is the AI agent. This server only starts it and hands it FinanceBro's tools.

```
Browser ─► Vercel /api/chat ──(AGENT_SERVER_URL)──► agent-server ─► CodeBuddy engine
                                                                       │
           Vercel /api/mcp ◄──────── FinanceBro tools ─────────────────┘
```

## On SovernStack (how it's set up now)

- **Session:** the SSH session `financebro-agent` runs on the **SARAWAK-1 CPU-only** cluster, at 0.08 credit/hr. The agent doesn't need a GPU. At that rate the RM30 credit lasts about two weeks.
- **SSH:** `ssh -i ~/.ssh/financebro-agent.pem -p 8903 root@sarawak.sovernstack.com`. The dashboard shows the host as `root@https://…`, which is wrong: drop the `https://`. You can only download the key once.
- **Software on the box:**
  - Node 22.20 in `/opt/node-v22.20.0-linux-x64`, linked into `/usr/local/bin`.
  - `@tencent-ai/codebuddy-code`, signed in with `codebuddy` → `/login`.
  - `cloudflared` in `/usr/local/bin`.
- **App files:** `/opt/financebro`, containing `agent-server/server.mjs`, `src/lib/agent/{runner,instructions}.ts`, `.env` (the secret, mode 600) and `start.sh`.
- **No public ports.** SovernStack only maps the SSH port, so `start.sh` starts the server on `127.0.0.1:8787` plus a tunnel:
  - **ngrok, fixed address** (in use): `https://trimmer-undocked-giddily.ngrok-free.dev`, the free dev domain of the ngrok account. It is set as `NGROK_DOMAIN` in `.env`, and the authtoken is in `/root/.config/ngrok/ngrok.yml`.
  - **Cloudflare quick tunnel** (fallback when `NGROK_DOMAIN` is unset): a new random `trycloudflare.com` URL on every start.
  - The URL in use is saved in `/opt/financebro/url.txt`.

**Restart.** Do this after the box restarts, or if the agent stops answering:
```bash
ssh -i ~/.ssh/financebro-agent.pem -p 8903 root@sarawak.sovernstack.com /opt/financebro/start.sh
```
With ngrok the address stays the same, so Vercel needs no change. Only with the Cloudflare fallback, update Vercel and redeploy after each restart:
```bash
vercel env rm AGENT_SERVER_URL production -y; echo -n "<new url>" | vercel env add AGENT_SERVER_URL production
```

**Update the code** after changing the runner, the instructions or the server, then run `start.sh` again:
```bash
scp -i ~/.ssh/financebro-agent.pem -P 8903 src/lib/agent/runner.ts src/lib/agent/instructions.ts root@sarawak.sovernstack.com:/opt/financebro/src/lib/agent/
```

**Vercel environment variables** (production):
- `AGENT_SERVER_URL`: `https://trimmer-undocked-giddily.ngrok-free.dev`
- `AGENT_SERVER_SECRET`: the value in `/opt/financebro/.env`.
- `MCP_TOKEN` (recommended): lock `/api/mcp`. Put the same value in `/opt/financebro/.env` too.

## Notes
- **What it accepts:** `POST /chat` only works with `Authorization: Bearer $AGENT_SERVER_SECRET`. `GET /health` is open, and it reveals nothing.
- **Engine lockdown:** the engine runs with only the financebro tools pre-approved, in `dontAsk` mode, in an empty temp folder. Shell and file tools are refused.
- **Limits:** at most 3 chats run at once (`MAX_CONCURRENT`), and each chat is stopped after 5 minutes.
- **Other machines:** the server works on any always-on Linux or macOS box. SovernStack is just the one the hackathon pays for.
