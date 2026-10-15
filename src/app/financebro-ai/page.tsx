"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useFinance } from "@/lib/FinanceContext";
import { ChatMessage, AgentExecutionStep } from "@/lib/types";
import { formatRM, formatDateShort, todayISO } from "@/lib/utils";
import { answerDebtQuestion } from "@/lib/debt/agent";
import { buildPayments } from "@/lib/debt/payments";
import { TOOL_LABELS } from "@/lib/agent/labels";
import { prepareReceipt, type ReceiptDraft } from "@/lib/receipts";
import {
  ArrowUp,
  Paperclip,
  X,
  FileText,
  Sparkles,
  Brain,
  ListChecks,
  Database,
  TrendingDown,
  Settings,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Check,
  ChevronRight,
} from "lucide-react";

const SUGGESTED_PROMPTS = [
  "Bro, how much do I owe on PayLater?",
  "Bro, who do I need to pay this week?",
  "Bro, build me a plan to clear my PayLater.",
  "Bro, can I take another PayLater plan of RM300?",
  "Bro, how much do I owe Shopee?",
  "Bro, which instalments are overdue?",
  "Bro, I paid RM100 to Shopee PayLater today.",
  "Bro, can I afford an extra RM100 towards Atome?",
];

const AGENT_STEP_ICONS: Record<string, typeof Brain> = {
  "Understanding request": Brain,
  "Planning tasks": ListChecks,
  "Retrieving financial records": Database,
  "Analyzing information": TrendingDown,
  "Preparing actions": Settings,
  "Awaiting approval": AlertCircle,
  "Executing actions": Loader2,
  "Verifying results": CheckCircle2,
};

function welcomeMessage(): ChatMessage {
  return {
    id: "welcome",
    role: "assistant",
    content: `Hey bro, I'm FinanceBro, powered by WorkBuddy. I track your Shopee, TikTok, Grab and Atome PayLater plans. Tell me about a new plan or a payment you made, or attach a screenshot of your PayLater checkout or bill, and I'll key it in. Ask what's due, whether you can take on another plan, or ask me for a plan to clear it all. I work from your real records.`,
    timestamp: new Date().toISOString(),
    isDemoPreview: true,
  };
}

export default function FinanceBroAIPage() {
  const { mode, cashFlow, debts, balance } = useFinance();
  // Amounts "due" only count what falls due by the end of this month.
  const dueBy = formatDateShort(cashFlow.monthEnd);
  const [messages, setMessages] = useState<ChatMessage[]>(() => [welcomeMessage()]);
  const [input, setInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const sentFromQuery = useRef(false);
  // WorkBuddy agent conversation for the current profile; "offline" falls back to quick answers.
  const agentSession = useRef<string | undefined>(undefined);
  const [agentStatus, setAgentStatus] = useState<"unknown" | "ready" | "offline" | "signin">("unknown");
  // Receipts picked but not sent yet.
  const [receipts, setReceipts] = useState<ReceiptDraft[]>([]);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const addReceipts = async (files: FileList | null) => {
    setReceiptError(null);
    const room = 3 - receipts.length;
    const picked = Array.from(files ?? []);
    if (picked.length > room) setReceiptError("Up to 3 files per message.");
    for (const file of picked.slice(0, Math.max(0, room))) {
      try {
        const draft = await prepareReceipt(file);
        setReceipts((prev) => [...prev, draft]);
      } catch (e) {
        setReceiptError(e instanceof Error ? e.message : "That file couldn't be used.");
      }
    }
  };

  // Prompts handed over from the dashboard (?q=...) send straight away.
  useEffect(() => {
    if (sentFromQuery.current) return;
    const q = new URLSearchParams(window.location.search).get("q");
    if (!q) return;
    sentFromQuery.current = true;
    window.history.replaceState(null, "", window.location.pathname);
    handleSend(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  // Grow the composer with its content, up to a cap.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [input]);

  const handleSend = (text?: string) => {
    const userText = text || input.trim();
    // Suggestion chips send text only; the composer also sends any receipts picked.
    const sent = text ? [] : receipts;
    if ((!userText && sent.length === 0) || isProcessing) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: userText,
      timestamp: new Date().toISOString(),
      attachments: sent.map((r) => ({ url: r.previewUrl, name: r.name, kind: r.kind })),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    if (!text) setReceipts([]);
    setReceiptError(null);
    setShowSuggestions(false);
    setIsProcessing(true);

    const finish = (assistantMsg: ChatMessage) => {
      setMessages((prev) => [...prev, assistantMsg]);
      setIsProcessing(false);
    };

    askWorkBuddy(userText, sent, finish).then((handled) => {
      if (handled) return;
      // Agent unavailable: fall back to the built-in quick answers. Receipts need the agent.
      if (sent.length > 0) {
        finish({
          id: `a-${Date.now()}`,
          role: "assistant",
          content: "Reading screenshots needs the WorkBuddy agent, and it isn't available right now. Try again in a bit, or add the plan on the PayLater page.",
          timestamp: new Date().toISOString(),
        });
      } else {
        simulateAgentResponse(userText, finish);
      }
    });
  };

  /**
   * Sends the message to the WorkBuddy agent and shows its steps live.
   * Resolves false when the agent can't run here, so the caller can fall back.
   */
  async function askWorkBuddy(userText: string, sent: ReceiptDraft[], callback: (msg: ChatMessage) => void): Promise<boolean> {
    const progressId = `agent-progress-${Date.now()}`;
    const steps: AgentExecutionStep[] = [
      {
        id: "think",
        step: 1,
        label: sent.length ? "Reading screenshot" : "Understanding request",
        status: "active",
        description: sent.length ? "WorkBuddy is reading the provider, amounts and due dates" : "WorkBuddy is reading your message",
      },
    ];
    const showSteps = () =>
      setMessages((prev) => {
        const card: ChatMessage = { id: progressId, role: "assistant", content: "", timestamp: new Date().toISOString(), agentSteps: [...steps] };
        return prev.some((m) => m.id === progressId) ? prev.map((m) => (m.id === progressId ? card : m)) : [...prev, card];
      });
    const removeSteps = () => setMessages((prev) => prev.filter((m) => m.id !== progressId));

    let res: Response;
    try {
      res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userText,
          mode,
          sessionId: agentSession.current,
          attachments: sent.length ? sent.map((r) => ({ mediaType: r.mediaType, data: r.data })) : undefined,
        }),
      });
    } catch {
      setAgentStatus("offline");
      return false;
    }
    if (res.status === 400 || res.status === 413) {
      const err = await res.json().catch(() => ({}));
      callback({
        id: `a-${Date.now()}`,
        role: "assistant",
        content: err.error || "That was too large to send. Try a smaller photo.",
        timestamp: new Date().toISOString(),
      });
      return true;
    }
    if (!res.ok || !res.body) {
      setAgentStatus("offline");
      return false;
    }
    showSteps();

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop() ?? "";
      for (const raw of events) {
        if (!raw.startsWith("data: ")) continue;
        const ev = JSON.parse(raw.slice(6));
        if (ev.type === "session") {
          agentSession.current = ev.sessionId;
        } else if (ev.type === "step") {
          steps[0].status = "completed";
          const existing = steps.find((s) => s.id === ev.id);
          const status = ev.status === "active" ? "active" : ev.status === "error" ? "error" : "completed";
          if (existing) existing.status = status;
          else steps.push({ id: ev.id, step: steps.length + 1, label: TOOL_LABELS[ev.tool] ?? ev.tool, status, description: "Using FinanceBro's records" });
          showSteps();
        } else if (ev.type === "done") {
          setAgentStatus("ready");
          agentSession.current = ev.sessionId;
          removeSteps();
          callback({
            id: `a-${Date.now()}`,
            role: "assistant",
            content: plainText(ev.reply) || "Done.",
            timestamp: new Date().toISOString(),
            agentSteps: steps.slice(1).map((s) => ({ ...s, status: s.status === "error" ? "error" : "completed" })),
          });
          return true;
        } else if (ev.type === "error") {
          removeSteps();
          if (ev.code === "not_signed_in") {
            setAgentStatus("signin");
            agentSession.current = undefined;
            return false;
          }
          setAgentStatus("ready");
          callback({
            id: `a-${Date.now()}`,
            role: "assistant",
            content: `WorkBuddy hit a problem: ${ev.message}\n\nTry again in a moment.`,
            timestamp: new Date().toISOString(),
          });
          return true;
        }
      }
    }
    removeSteps();
    setAgentStatus("offline");
    return false;
  }

  function simulateAgentResponse(userText: string, callback: (msg: ChatMessage) => void) {
    const lowerText = userText.toLowerCase();
    const rmMatch = userText.match(/RM?\s?(\d+(?:\.\d+)?)/i);
    const amount = rmMatch ? parseFloat(rmMatch[1]) : 0;
    const reply = (labels: string[], content: string) => {
      const steps = createAgentSteps(labels);
      animateAgentSteps(steps, () =>
        callback({
          id: `a-${Date.now()}`,
          role: "assistant",
          content,
          timestamp: new Date().toISOString(),
          isDemoPreview: true,
          agentSteps: steps.map((s) => ({ ...s, status: "completed" as const })),
        })
      );
    };

    // PayLater questions first: every figure comes from the same functions as the PayLater page.
    const today = todayISO();
    const debtAnswer = answerDebtQuestion(userText, { debts, payments: buildPayments(debts, [], today), cashFlow, balance, today });
    if (debtAnswer) {
      reply(["Understanding request", "Retrieving financial records", "Analyzing information", "Verifying results"], debtAnswer);
      return;
    }

    // "Can I take another PayLater plan of RM300?" / "Can I afford RM300?"
    if ((lowerText.includes("afford") || lowerText.includes("another") || lowerText.includes("take")) && amount > 0) {
      const after = (Math.round(cashFlow.projectedCash * 100) - Math.round(amount * 100)) / 100;
      reply(
        ["Understanding request", "Retrieving financial records", "Analyzing information", "Verifying results"],
        `Cash now: ${formatRM(cashFlow.availableCash)}\nPayLater instalments due by ${dueBy}: ${formatRM(cashFlow.debtRepaymentsDue)}\nLeft after those: ${formatRM(cashFlow.projectedCash)}\n\nAnother ${formatRM(amount)} on top of that leaves ${formatRM(after)}.\n\n${
          after >= 0
            ? "You can cover it, but every new plan adds to next month's instalments. Check them first."
            : "Skip it for now, bro. You can't cover the instalments you already have."
        }`
      );
      return;
    }

    // "How much money do I have left?"
    if (lowerText.includes("left") || lowerText.includes("balance") || lowerText.includes("have")) {
      reply(
        ["Understanding request", "Retrieving financial records", "Analyzing information", "Verifying results"],
        `Cash now: ${formatRM(cashFlow.availableCash)}\nPayLater instalments due by ${dueBy}: ${formatRM(cashFlow.debtRepaymentsDue)}\nLeft after those: ${formatRM(cashFlow.projectedCash)}\n\n${
          cashFlow.projectedCash >= 0
            ? "You can cover every instalment that's due."
            : "You'll come up short on your instalments. Hold off on new PayLater plans."
        }`
      );
      return;
    }

    // Default
    setTimeout(() => {
      callback({
        id: `a-${Date.now()}`,
        role: "assistant",
        content: `I can't handle that one yet. Ask how much you owe on PayLater, who to pay this week, or whether you can take on another plan.`,
        timestamp: new Date().toISOString(),
        isDemoPreview: true,
      });
    }, 800);
  }

  function createAgentSteps(labels: string[]): AgentExecutionStep[] {
    return labels.map((label, i) => ({
      id: `step-${Date.now()}-${i}`,
      step: i + 1,
      label,
      status: "pending" as const,
      description: getStepDescription(label),
    }));
  }

  function getStepDescription(label: string): string {
    switch (label) {
      case "Understanding request":
        return "Reading the amount and what you want done";
      case "Planning tasks":
        return "Working out which records to touch";
      case "Retrieving financial records":
        return "Fetching your PayLater plans and cash";
      case "Analyzing information":
        return "Running the numbers";
      case "Preparing actions":
        return "Drafting the change for you to review";
      case "Awaiting approval":
        return "Nothing is saved until you confirm";
      case "Executing actions":
        return "Saving the change";
      case "Verifying results":
        return "Re-checking the totals";
      default:
        return "";
    }
  }

  function animateAgentSteps(steps: AgentExecutionStep[], onComplete: () => void) {
    let currentStep = 0;
    const interval = setInterval(() => {
      if (currentStep >= steps.length) {
        clearInterval(interval);
        // Swap the live progress card for the final answer.
        setMessages((prev) => prev.filter((m) => !m.id.startsWith("agent-progress")));
        onComplete();
        return;
      }
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.id.startsWith("agent-progress")) {
          const updatedSteps = [...steps].map((s, i) => ({
            ...s,
            status: (i < currentStep ? "completed" : i === currentStep ? "active" : "pending") as AgentExecutionStep["status"],
          }));
          return [...prev.slice(0, -1), { ...last, agentSteps: updatedSteps }];
        } else {
          const updatedSteps = [...steps].map((s, i) => ({
            ...s,
            status: (i === 0 ? "active" : "pending") as AgentExecutionStep["status"],
          }));
          return [
            ...prev,
            {
              id: `agent-progress-${Date.now()}`,
              role: "assistant" as const,
              content: "",
              timestamp: new Date().toISOString(),
              isDemoPreview: true,
              agentSteps: updatedSteps,
            },
          ];
        }
      });
      currentStep++;
    }, 500);
  }

  const hasProgressCard = messages.some((m) => m.id.startsWith("agent-progress"));

  return (
    <div className="mx-auto flex h-[calc(100dvh-var(--topbar-h)-var(--tabbar-h))] max-w-3xl flex-col">
      {/* Conversation */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6">
        <div className="pb-2 pt-2 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-[rgb(20_168_152)] to-[rgb(6_78_72)] text-white shadow-card">
            <Sparkles className="h-6 w-6" />
          </span>
          <h1 className="mt-2 text-title3">FinanceBro AI</h1>
          <p className="text-footnote text-label-2">
            {agentStatus === "signin" ? (
              <>WorkBuddy isn&apos;t signed in on this computer, so these are quick answers. </>
            ) : agentStatus === "offline" ? (
              <>WorkBuddy agent unavailable here, so these are quick answers. </>
            ) : (
              <>Powered by WorkBuddy · </>
            )}
            <Link href="/agent" className="text-accent-text">
              {agentStatus === "signin" || agentStatus === "offline" ? "Set it up" : "Activity"}
            </Link>
          </p>
        </div>

        <div className="space-y-2 py-4">
          {messages.map((msg, i) => (
            <ChatMessageBubble
              key={msg.id}
              message={msg}
              grouped={i > 0 && messages[i - 1].role === msg.role}
            />
          ))}
          {isProcessing && !hasProgressCard && <TypingIndicator />}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Composer on a translucent layer; the thread scrolls underneath */}
      <div className="material material-edge-t px-4 pb-3 pt-2 sm:px-6">
        {showSuggestions && messages.length <= 1 && (
          <div className="no-scrollbar -mx-4 mb-2 flex gap-2 overflow-x-auto px-4 sm:-mx-6 sm:px-6">
            {SUGGESTED_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                onClick={() => handleSend(prompt)}
                className="press shrink-0 rounded-full bg-surface px-3.5 py-2 text-subhead text-label shadow-card ring-1 ring-[color:var(--separator)]"
              >
                {prompt}
              </button>
            ))}
          </div>
        )}
        {(receipts.length > 0 || receiptError) && (
          <div className="mb-2 flex flex-wrap items-center gap-2">
            {receipts.map((r) => (
              <div key={r.id} className="relative h-14 w-14 overflow-hidden rounded-xl bg-surface ring-1 ring-[color:var(--separator)] animate-rise">
                {r.kind === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.previewUrl} alt={r.name} className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full w-full flex-col items-center justify-center gap-0.5 text-caption text-label-2">
                    <FileText className="h-5 w-5" />
                    PDF
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setReceipts((prev) => prev.filter((x) => x.id !== r.id))}
                  aria-label={`Remove ${r.name}`}
                  className="press absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white"
                >
                  <X className="h-3 w-3" strokeWidth={3} />
                </button>
              </div>
            ))}
            {receiptError && <p className="text-footnote text-negative">{receiptError}</p>}
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex items-end gap-1 rounded-[1.4rem] bg-surface py-1.5 pl-1.5 pr-1.5 ring-1 ring-[color:var(--separator)] transition-shadow focus-within:shadow-[0_0_0_3px_rgb(var(--accent)/0.3)]"
        >
          <input
            ref={fileRef}
            type="file"
            accept="image/*,application/pdf"
            multiple
            hidden
            onChange={(e) => {
              addReceipts(e.target.files);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={isProcessing || receipts.length >= 3}
            aria-label="Add a screenshot"
            title="Add a PayLater screenshot or bill (photo or PDF)"
            className="press flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-label-2 transition-colors hover:bg-gray/12 disabled:opacity-40"
          >
            <Paperclip className="h-[18px] w-[18px]" />
          </button>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={receipts.length ? "Add a note (optional)" : "Message FinanceBro"}
            aria-label="Message FinanceBro"
            rows={1}
            className="max-h-[120px] flex-1 resize-none self-center bg-transparent py-1 text-body text-label outline-none placeholder:text-label-3"
          />
          <button
            type="submit"
            disabled={(!input.trim() && receipts.length === 0) || isProcessing}
            aria-label="Send"
            className="press flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-white transition-opacity disabled:bg-gray/30"
          >
            <ArrowUp className="h-[18px] w-[18px]" strokeWidth={2.75} />
          </button>
        </form>
      </div>
    </div>
  );
}

function ChatMessageBubble({ message, grouped }: { message: ChatMessage; grouped: boolean }) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div className={`flex flex-col items-end gap-1 animate-rise ${grouped ? "" : "pt-2"}`}>
        {message.attachments && message.attachments.length > 0 && (
          <div className="flex max-w-[78%] flex-wrap justify-end gap-1">
            {message.attachments.map((a) =>
              a.kind === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={a.url} src={a.url} alt={a.name} className="h-32 w-24 rounded-2xl object-cover ring-1 ring-[color:var(--separator)]" />
              ) : (
                <span key={a.url} className="flex items-center gap-1.5 rounded-2xl bg-gray/12 px-3 py-2 text-subhead text-label">
                  <FileText className="h-4 w-4 text-label-2" />
                  {a.name}
                </span>
              )
            )}
          </div>
        )}
        {message.content && (
          <div className="max-w-[78%] whitespace-pre-line rounded-[1.25rem] rounded-br-md bg-accent px-3.5 py-2 text-body text-white">
            {message.content}
          </div>
        )}
      </div>
    );
  }

  // Live agent progress
  if (message.agentSteps && message.content === "") {
    return (
      <div className={`animate-rise ${grouped ? "" : "pt-2"}`}>
        <div className="max-w-[85%] rounded-[1.25rem] rounded-bl-md bg-gray/12 px-4 py-3 sm:max-w-sm">
          <ol className="space-y-2">
            {message.agentSteps.map((step) => (
              <AgentStepItem key={step.id} step={step} />
            ))}
          </ol>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col items-start gap-2 animate-rise ${grouped ? "" : "pt-2"}`}>
      <div className="tabular max-w-[85%] whitespace-pre-line rounded-[1.25rem] rounded-bl-md bg-gray/12 px-3.5 py-2 text-body text-label">
        <WithReportLinks text={message.content} />
      </div>

      {message.agentSteps && message.agentSteps.length > 0 && (
        <details className="group px-1 text-footnote text-label-2">
          <summary className="flex cursor-pointer list-none items-center gap-1 [&::-webkit-details-marker]:hidden">
            <Check className="h-3.5 w-3.5 text-positive" strokeWidth={3} />
            {message.agentSteps.length} step{message.agentSteps.length === 1 ? "" : "s"}
            <ChevronRight className="h-3.5 w-3.5 transition-transform duration-300 ease-spring group-open:rotate-90" />
          </summary>
          <ol className="mt-1.5 space-y-1 pl-5">
            {message.agentSteps.map((s) => (
              <li key={s.id}>{s.label}</li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}

function AgentStepItem({ step }: { step: AgentExecutionStep }) {
  const Icon = AGENT_STEP_ICONS[step.label] || CheckCircle2;

  return (
    <li className="flex items-start gap-2.5">
      <span className="mt-px flex h-5 w-5 shrink-0 items-center justify-center">
        {step.status === "completed" ? (
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-positive text-white">
            <Check className="h-3 w-3" strokeWidth={3.5} />
          </span>
        ) : step.status === "active" ? (
          <Loader2 className="h-4 w-4 animate-spin text-accent-text" />
        ) : (
          <Icon className="h-4 w-4 text-label-3" />
        )}
      </span>
      <span className="min-w-0">
        <span
          className={`block text-subhead transition-colors duration-200 ${
            step.status === "pending" ? "text-label-3" : step.status === "active" ? "font-medium text-label" : "text-label-2"
          }`}
        >
          {step.label}
        </span>
        {step.status === "active" && step.description && (
          <span className="block text-footnote text-label-2 animate-fade">{step.description}</span>
        )}
      </span>
    </li>
  );
}

const REPORT_LINK = /((?:https?:\/\/[^\s/]+)?\/reports\?[^\s)\]>"']+)/g;

/** Report links from generate_report become an "Open report" button that opens in the app. */
function WithReportLinks({ text }: { text: string }) {
  const parts = text.split(REPORT_LINK);
  return (
    <>
      {parts.map((part, i) => {
        if (i % 2 === 0) return part;
        const href = part.replace(/^https?:\/\/[^/]+/, "");
        return (
          <Link
            key={i}
            href={href}
            className="press my-1 inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-subhead font-medium text-white"
          >
            <FileText className="h-4 w-4" />
            Open report
          </Link>
        );
      })}
    </>
  );
}

/** Agents write light markdown; the chat bubble shows plain text. */
function plainText(text: string): string {
  return text
    .replace(/\[([^\]]*)\]\(([^)\s]+)\)/g, "$2") // markdown links: keep the URL so report links become buttons
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[*]\s+/gm, "- ")
    .replace(/`([^`]+)`/g, "$1")
    .trim();
}

function TypingIndicator() {
  return (
    <div className="pt-2 animate-fade" aria-label="FinanceBro is typing">
      <div className="inline-flex items-center gap-1 rounded-[1.25rem] rounded-bl-md bg-gray/12 px-4 py-3">
        <span className="typing-dot h-2 w-2 rounded-full bg-label-3" />
        <span className="typing-dot h-2 w-2 rounded-full bg-label-3" />
        <span className="typing-dot h-2 w-2 rounded-full bg-label-3" />
      </div>
    </div>
  );
}
