# FinanceBro × WorkBuddy

WorkBuddy's agents are FinanceBro's AI. WorkBuddy does the reasoning. FinanceBro supplies the tools, over MCP at `/api/mcp`. Those tools read the user's records, key in data, and do every calculation. Each tool call appears live on the app's **WorkBuddy Agent** page (`/agent`), and the dashboard updates through Realtime.

## Setup

1. **Add the connector.** In WorkBuddy, go to **专家·技能·连接器 → 连接器 → 自定义连接器** (Experts · Skills · Connectors → Connectors → Custom connector), then paste:

   ```json
   {
     "mcpServers": {
       "financebro": {
         "type": "stdio",
         "command": "npx",
         "args": ["-y", "mcp-remote", "https://finance-bro-iota.vercel.app/api/mcp"],
         "description": "FinanceBro AI: balances, debts, budgets, data entry and plans"
       }
     }
   }
   ```

   - `mcp-remote` bridges WorkBuddy's stdio connector to FinanceBro's HTTP endpoint, and it needs Node.js.
   - If your WorkBuddy build accepts a remote MCP URL directly, use `https://finance-bro-iota.vercel.app/api/mcp` (Streamable HTTP).
   - For a local dev server, use `http://localhost:3000/api/mcp`.

2. **Add the skill.** Import the `financebro/` folder (its `SKILL.md`) as a skill. Or open the skill-creation chat and paste `SKILL.md` into it. The skill tells the agent when to use FinanceBro and which rules to follow: snapshot first, never invent figures, nothing moves money.

3. **Optional: lock it down.** Set `MCP_TOKEN` on Vercel. Then add `"--header", "Authorization:Bearer <token>"` to the `args`, or append `?token=<token>` to the URL.

## Tools

| Tool | What it does |
|---|---|
| `get_snapshot` | Gives the balance, safe-to-spend and daily allowance, the cash flow to month end, debt totals, spending by category, and data issues |
| `list_transactions`, `list_debts`, `list_payments_due`, `monthly_report` | Read the user's records |
| `generate_report` | Creates a monthly, spending or debt-schedule report with FinanceBro's report generator, and returns a link to it (CSV and PDF on the page) |
| `check_affordability`, `debt_payoff_scenario` | Answer "can I afford X" and "what if I pay extra" |
| `add_transactions` | Keys in many transactions in one call, skipping duplicates |
| `update_transaction` | Re-categorises or fixes a transaction |
| `add_bill`, `mark_bill_paid` | Add and pay bills |
| `add_debt`, `record_debt_payment` | Add debts with a schedule, and record payments (idempotent, never overpays) |
| `set_budgets`, `add_expected_income` | Put a plan into effect |

You can test without WorkBuddy:

```bash
npx -y @modelcontextprotocol/inspector --cli https://finance-bro-iota.vercel.app/api/mcp --transport http --method tools/list
```
