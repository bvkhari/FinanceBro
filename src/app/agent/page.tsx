"use client";

import { useEffect, useState } from "react";
import { useFinance } from "@/lib/FinanceContext";
import { useAgentActivity } from "@/lib/agent/useAgentActivity";
import { TOOL_LABELS } from "@/lib/agent/labels";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { AlertCircle, Check, Copy, Pencil, Search, Bot } from "lucide-react";

const PROMPTS = [
  "I bought a RM360 phone case set on Grab PayLater, RM120 × 3 months, first payment 25 Oct.",
  "I paid Shopee PayLater RM100 today.",
  "Make me a plan to clear all my PayLater before December.",
  "Can I take a RM150 concert ticket on Atome this week?",
];

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (key: string, text: string) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
    });
  };
  return { copied, copy };
}

function timeAgo(iso: string) {
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString("en-MY", { day: "numeric", month: "short" });
}

export default function AgentPage() {
  const { profile } = useFinance();
  const { items, loading, error } = useAgentActivity(profile?.id);
  const { copied, copy } = useCopy();
  const [origin, setOrigin] = useState("https://finance-bro-iota.vercel.app");
  useEffect(() => setOrigin(window.location.origin), []);

  const url = `${origin}/api/mcp`;
  const config = JSON.stringify(
    {
      mcpServers: {
        financebro: {
          type: "stdio",
          command: "npx",
          args: ["-y", "mcp-remote", url],
          description: "FinanceBro AI: PayLater (BNPL) plans, instalments, payments and payoff plans",
        },
      },
    },
    null,
    2
  );

  // Re-render the relative times every 30 s.
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <PageHeader
        title="WorkBuddy Agent"
        subtitle="WorkBuddy's agents do the thinking. FinanceBro gives them your records and does every calculation."
      />

      <div className="space-y-8">
        <Card title="What the agent did" icon={<Bot className="h-5 w-5 text-accent-text" />} flush>
          {loading ? (
            <p className="p-4 text-subhead text-label-2">Loading…</p>
          ) : error ? (
            <p className="p-4 text-subhead text-negative">{error}</p>
          ) : items.length === 0 ? (
            <p className="p-4 text-subhead text-label-2">
              Nothing yet on {profile?.displayName ?? "this profile"}. Connect WorkBuddy below and ask it something. Its steps show up here live.
            </p>
          ) : (
            <ol className="grouped">
              {items.map((a) => (
                <li key={a.id} className="flex items-start gap-3 px-4 py-3 animate-rise">
                  <span
                    className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                      !a.ok ? "bg-negative/12 text-negative" : a.isWrite ? "bg-accent/12 text-accent-text" : "bg-gray/12 text-label-2"
                    }`}
                  >
                    {!a.ok ? <AlertCircle className="h-4 w-4" /> : a.isWrite ? <Pencil className="h-3.5 w-3.5" /> : <Search className="h-3.5 w-3.5" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="truncate text-headline text-label">{TOOL_LABELS[a.tool] ?? a.tool}</p>
                      <span className="shrink-0 text-footnote text-label-3">{timeAgo(a.createdAt)}</span>
                    </div>
                    <p className={`tabular text-subhead ${a.ok ? "text-label-2" : "text-negative"}`}>{a.summary}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Card>

        <Card title="Try asking WorkBuddy" flush>
          <ul className="grouped">
            {PROMPTS.map((p) => (
              <li key={p}>
                <button onClick={() => copy(p, p)} className="press flex w-full items-center gap-3 px-4 py-3 text-left">
                  <span className="flex-1 text-body text-label">{p}</span>
                  {copied === p ? <Check className="h-4 w-4 shrink-0 text-positive" /> : <Copy className="h-4 w-4 shrink-0 text-label-3" />}
                </button>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Connect WorkBuddy">
          <ol className="list-decimal space-y-2 pl-5 text-body text-label">
            <li>In WorkBuddy, open <b>专家·技能·连接器</b> (Experts · Skills · Connectors), then <b>连接器</b> (Connectors).</li>
            <li>Click <b>自定义连接器</b> (Custom connector) and paste this config.</li>
            <li>Install the FinanceBro skill from the repo&apos;s <code className="text-subhead">workbuddy/financebro</code> folder so the agent follows FinanceBro&apos;s rules.</li>
          </ol>
          <div className="relative mt-4">
            <pre className="overflow-x-auto rounded-xl bg-gray/12 p-3 pr-12 text-footnote text-label">{config}</pre>
            <button
              onClick={() => copy("config", config)}
              aria-label="Copy config"
              className="press absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-lg bg-surface text-label-2 shadow-card"
            >
              {copied === "config" ? <Check className="h-4 w-4 text-positive" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
          <p className="mt-3 text-footnote text-label-2">
            If your WorkBuddy accepts remote MCP servers directly, use the URL <code className="break-all">{url}</code> (Streamable HTTP). Needs Node.js for{" "}
            <code>npx</code> otherwise.
          </p>
        </Card>
      </div>
    </div>
  );
}
