"use client";

import { useState, useRef, useEffect } from "react";
import { useFinance } from "@/lib/FinanceContext";
import { ChatMessage, AgentExecutionStep, TransactionPreviewData, TransactionType } from "@/lib/types";
import { formatRM, formatDateShort } from "@/lib/utils";
import {
  ArrowUp,
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
  "Bro, I spent RM59 today.",
  "Bro, how much money do I have left?",
  "Bro, can I afford to spend RM300?",
  "Bro, help me manage my monthly budget.",
  "Bro, show my upcoming bills.",
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
    content: `Hey bro. Tell me what you spent, or ask whether you can afford something. I'll check it against your balance and the bills you still owe.`,
    timestamp: new Date().toISOString(),
    isDemoPreview: true,
  };
}

export default function FinanceBroAIPage() {
  const { summary, mode, addTransaction, profile, cashFlow } = useFinance();
  // Amounts "due" only count what falls due by the end of this month.
  const dueBy = formatDateShort(cashFlow.monthEnd);
  const [messages, setMessages] = useState<ChatMessage[]>(() => [welcomeMessage()]);
  const [input, setInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const sentFromQuery = useRef(false);

  // Switching mode starts a fresh conversation.
  const lastMode = useRef(mode);
  useEffect(() => {
    if (lastMode.current === mode) return;
    lastMode.current = mode;
    setMessages([welcomeMessage()]);
    setShowSuggestions(true);
  }, [mode]);

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
    if (!userText || isProcessing) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: userText,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setShowSuggestions(false);
    setIsProcessing(true);

    // Simulate AI agent workflow
    simulateAgentResponse(userText, (assistantMsg) => {
      setMessages((prev) => [...prev, assistantMsg]);
      setIsProcessing(false);
    });
  };

  function simulateAgentResponse(userText: string, callback: (msg: ChatMessage) => void) {
    const lowerText = userText.toLowerCase();
    const rmMatch = userText.match(/RM?\s?(\d+(?:\.\d+)?)/i);
    const amount = rmMatch ? parseFloat(rmMatch[1]) : 0;
    const account = mode === "individual" ? "personal" : "business";

    // Scenario 1: "I spent RMXX"
    if (lowerText.includes("spent") && amount > 0) {
      const steps = createAgentSteps([
        "Understanding request",
        "Planning tasks",
        "Retrieving financial records",
        "Analyzing information",
        "Preparing actions",
        "Awaiting approval",
      ]);

      animateAgentSteps(steps, () => {
        const assistantMsg: ChatMessage = {
          id: `a-${Date.now()}`,
          role: "assistant",
          content: `Got it, ${formatRM(amount)}. I've filed it as a ${account} expense under Food. Check the details, then confirm.`,
          timestamp: new Date().toISOString(),
          isDemoPreview: true,
          agentSteps: steps.map((s) => ({ ...s, status: "completed" as const })),
          transactionPreview: {
            amount,
            type: "expense",
            category: "Food",
            account: mode === "individual" ? "Personal" : "Business",
            description: "Logged via FinanceBro AI",
          },
        };
        callback(assistantMsg);
      });
      return;
    }

    // Scenario 2: "how much money do I have left"
    if (lowerText.includes("left") || lowerText.includes("balance") || lowerText.includes("have")) {
      const steps = createAgentSteps([
        "Understanding request",
        "Retrieving financial records",
        "Analyzing information",
        "Verifying results",
      ]);
      animateAgentSteps(steps, () => {
        const assistantMsg: ChatMessage = {
          id: `a-${Date.now()}`,
          role: "assistant",
          content: `Here's where you stand.\n\nBalance: ${formatRM(summary.currentBalance)}\nSpent this month: ${formatRM(summary.totalMonthlyExpenses)}\nBills and repayments due by ${dueBy}: ${formatRM(summary.upcomingCommitments)}\nLeft after those: ${formatRM(summary.projectedRemainingBalance)}\n\n${
            summary.projectedRemainingBalance > 0
              ? "You can cover every bill that's due."
              : "You'll come up short once the bills go out. Hold off on anything you don't need."
          }`,
          timestamp: new Date().toISOString(),
          isDemoPreview: true,
          agentSteps: steps.map((s) => ({ ...s, status: "completed" as const })),
        };
        callback(assistantMsg);
      });
      return;
    }

    // Scenario 3: "can I afford RMXX"
    if ((lowerText.includes("afford") || lowerText.includes("spend")) && amount > 0) {
      const steps = createAgentSteps([
        "Understanding request",
        "Retrieving financial records",
        "Analyzing information",
        "Preparing actions",
        "Verifying results",
      ]);
      animateAgentSteps(steps, () => {
        const canAfford = summary.projectedRemainingBalance - amount > 0;
        const afterSpend = summary.projectedRemainingBalance - amount;
        const assistantMsg: ChatMessage = {
          id: `a-${Date.now()}`,
          role: "assistant",
          content: `Balance: ${formatRM(summary.currentBalance)}\nBills and repayments due by ${dueBy}: ${formatRM(summary.upcomingCommitments)}\nLeft after those: ${formatRM(summary.projectedRemainingBalance)}\n\nSpend ${formatRM(amount)} and that drops to ${formatRM(afterSpend)}.\n\n${
            canAfford
              ? "Yes, you can afford it."
              : "Skip it for now, bro. It puts you in the red once your bills go out."
          }`,
          timestamp: new Date().toISOString(),
          isDemoPreview: true,
          agentSteps: steps.map((s) => ({ ...s, status: "completed" as const })),
        };
        callback(assistantMsg);
      });
      return;
    }

    // Scenario 4: budget management
    if (lowerText.includes("budget")) {
      const steps = createAgentSteps([
        "Understanding request",
        "Retrieving financial records",
        "Analyzing information",
        "Preparing actions",
      ]);
      animateAgentSteps(steps, () => {
        const used = summary.totalMonthlyExpenses / profile.monthlyBudget;
        const assistantMsg: ChatMessage = {
          id: `a-${Date.now()}`,
          role: "assistant",
          content: `Monthly budget: ${formatRM(profile.monthlyBudget)}\nSpent: ${formatRM(summary.totalMonthlyExpenses)}\nRemaining: ${formatRM(summary.budgetRemaining)}\nUsed: ${Math.round(used * 100)}%\n\n${
            used > 0.8
              ? "You've used more than 80% and the month isn't over. Cut the non-essentials until payday."
              : "You're on track."
          }`,
          timestamp: new Date().toISOString(),
          isDemoPreview: true,
          agentSteps: steps.map((s) => ({ ...s, status: "completed" as const })),
        };
        callback(assistantMsg);
      });
      return;
    }

    // Scenario 5: upcoming bills
    if (lowerText.includes("bill") || lowerText.includes("upcoming") || lowerText.includes("commitment")) {
      const steps = createAgentSteps([
        "Understanding request",
        "Retrieving financial records",
        "Analyzing information",
        "Verifying results",
      ]);
      animateAgentSteps(steps, () => {
        const assistantMsg: ChatMessage = {
          id: `a-${Date.now()}`,
          role: "assistant",
          content: `You have ${formatRM(summary.upcomingCommitments)} in bills and debt repayments due by ${dueBy}. The Payments tab on the Debts page lists each one, and you can record payments there.`,
          timestamp: new Date().toISOString(),
          isDemoPreview: true,
          agentSteps: steps.map((s) => ({ ...s, status: "completed" as const })),
        };
        callback(assistantMsg);
      });
      return;
    }

    // Default
    setTimeout(() => {
      const assistantMsg: ChatMessage = {
        id: `a-${Date.now()}`,
        role: "assistant",
        content: `I can't handle that one yet. Ask about your balance, your budget or whether you can afford something, or log a spend like "Bro, I spent RM59 today."`,
        timestamp: new Date().toISOString(),
        isDemoPreview: true,
      };
      callback(assistantMsg);
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
        return "Fetching transactions, balance and bills";
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

  // Confirm transaction from preview
  const handleConfirmTransaction = (messageId: string, preview: TransactionPreviewData) => {
    addTransaction({
      name: preview.description || "Expense via FinanceBro AI",
      amount: preview.amount,
      type: preview.type as TransactionType,
      category: preview.category,
      date: new Date().toISOString().split("T")[0],
      description: preview.description,
    });

    setMessages((prev) =>
      prev
        .map((m) => (m.id === messageId ? { ...m, transactionPreview: undefined } : m))
        .concat({
          id: `success-${Date.now()}`,
          role: "assistant" as const,
          content: `Saved: ${formatRM(preview.amount)} ${preview.type} under ${preview.category}.\nNew balance: ${formatRM(summary.currentBalance - preview.amount)}`,
          timestamp: new Date().toISOString(),
          isDemoPreview: true,
          agentSteps: [
            { id: "ex1", step: 1, label: "Executing actions", status: "completed" as const },
            { id: "ex2", step: 2, label: "Verifying results", status: "completed" as const },
          ],
        })
    );
  };

  const handleCancelTransaction = (messageId: string) => {
    setMessages((prev) =>
      prev
        .map((m) => (m.id === messageId ? { ...m, transactionPreview: undefined } : m))
        .concat({
          id: `cancel-${Date.now()}`,
          role: "assistant" as const,
          content: "Cancelled. Nothing was saved.",
          timestamp: new Date().toISOString(),
          isDemoPreview: true,
        })
    );
  };

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
          <p className="text-footnote text-label-2">Demo · replies are simulated</p>
        </div>

        <div className="space-y-2 py-4">
          {messages.map((msg, i) => (
            <ChatMessageBubble
              key={msg.id}
              message={msg}
              grouped={i > 0 && messages[i - 1].role === msg.role}
              onConfirm={() => msg.transactionPreview && handleConfirmTransaction(msg.id, msg.transactionPreview)}
              onCancel={() => handleCancelTransaction(msg.id)}
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
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex items-end gap-2 rounded-[1.4rem] bg-surface py-1.5 pl-4 pr-1.5 ring-1 ring-[color:var(--separator)] transition-shadow focus-within:shadow-[0_0_0_3px_rgb(var(--accent)/0.3)]"
        >
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
            placeholder="Message FinanceBro"
            aria-label="Message FinanceBro"
            rows={1}
            className="max-h-[120px] flex-1 resize-none self-center bg-transparent py-1 text-body text-label outline-none placeholder:text-label-3"
          />
          <button
            type="submit"
            disabled={!input.trim() || isProcessing}
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

function ChatMessageBubble({
  message,
  grouped,
  onConfirm,
  onCancel,
}: {
  message: ChatMessage;
  grouped: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div className={`flex justify-end animate-rise ${grouped ? "" : "pt-2"}`}>
        <div className="max-w-[78%] whitespace-pre-line rounded-[1.25rem] rounded-br-md bg-accent px-3.5 py-2 text-body text-white">
          {message.content}
        </div>
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
        {message.content}
      </div>

      {message.transactionPreview && (
        <TransactionPreviewCard preview={message.transactionPreview} onConfirm={onConfirm} onCancel={onCancel} />
      )}

      {message.agentSteps && message.agentSteps.length > 0 && (
        <details className="group px-1 text-footnote text-label-2">
          <summary className="flex cursor-pointer list-none items-center gap-1 [&::-webkit-details-marker]:hidden">
            <Check className="h-3.5 w-3.5 text-positive" strokeWidth={3} />
            {message.agentSteps.length} steps
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

function TransactionPreviewCard({
  preview,
  onConfirm,
  onCancel,
}: {
  preview: TransactionPreviewData;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-surface shadow-float ring-1 ring-[color:var(--separator)] animate-rise">
      <div className="px-4 pb-3 pt-4">
        <p className="text-footnote font-medium text-label-2">New {preview.type}</p>
        <p className={`tabular text-title1 ${preview.type === "income" ? "text-positive" : "text-label"}`}>
          {formatRM(preview.amount)}
        </p>
      </div>
      <dl className="grouped mx-4 text-subhead">
        {[
          ["Category", preview.category],
          ["Account", preview.account],
          ...(preview.description ? [["Note", preview.description]] : []),
        ].map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 py-2.5">
            <dt className="text-label-2">{k}</dt>
            <dd className="truncate text-label">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="grid grid-cols-2 gap-2 p-3">
        <button onClick={onCancel} className="press h-10 rounded-xl bg-gray/12 text-headline text-label">
          Cancel
        </button>
        <button onClick={onConfirm} className="press h-10 rounded-xl bg-accent text-headline text-white">
          Confirm
        </button>
      </div>
    </div>
  );
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
