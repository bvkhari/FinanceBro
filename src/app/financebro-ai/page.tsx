"use client";

import { useState, useRef, useEffect } from "react";
import { useFinance } from "@/lib/FinanceContext";
import { ChatMessage, AgentExecutionStep, AgentAction, TransactionPreviewData, TransactionType } from "@/lib/types";
import { formatRM, formatRMCompact } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import {
  Bot,
  Send,
  Sparkles,
  Brain,
  ListChecks,
  Database,
  TrendingDown,
  Settings,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Receipt,
  Wallet,
  TrendingUp,
  PiggyBank,
  X,
  Check,
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

export default function FinanceBroAIPage() {
  const { summary, mode, addTransaction, profile } = useFinance();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Welcome message
    setMessages([
      {
        id: "welcome",
        role: "assistant",
        content: `Hey bro! 👋 I'm FinanceBro AI, your personal financial copilot. I can help you track expenses, manage budgets, and plan your finances. Try asking me something — like "Bro, I spent RM59 today" or "Bro, how much money do I have left?"\n\n⚠️ Demo Preview: Responses are simulated. Backend AI integration coming soon.`,
        timestamp: new Date().toISOString(),
        isDemoPreview: true,
      },
    ]);
  }, [mode]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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

      // First: agent steps animation
      animateAgentSteps(steps, () => {
        const assistantMsg: ChatMessage = {
          id: `a-${Date.now()}`,
          role: "assistant",
          content: `Bro, I see you spent ${formatRM(amount)}. Was this a personal or business expense? And what category? For now, I'll assume it's a ${mode === "individual" ? "personal" : "business"} expense. Please confirm the transaction below.`,
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
          content: `Bro, here's your current financial situation:\n\n💰 Current Balance: ${formatRM(summary.currentBalance)}\n📉 Monthly Expenses: ${formatRM(summary.totalMonthlyExpenses)}\n📅 Upcoming Commitments: ${formatRM(summary.upcomingCommitments)}\n🎯 Projected Remaining: ${formatRM(summary.projectedRemainingBalance)}\n\nYou're in ${mode === "individual" ? "Individual" : "Business"} mode. ${
            summary.projectedRemainingBalance > 0
              ? "You're looking good, bro! You've got enough to cover your upcoming commitments."
              : "Heads up, bro — after your upcoming commitments, you might be short. Consider cutting back on non-essential spending."
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
          content: `Bro, let me check for you...\n\n📊 Current Balance: ${formatRM(summary.currentBalance)}\n📅 Upcoming Commitments: ${formatRM(summary.upcomingCommitments)}\n🎯 Projected Remaining: ${formatRM(summary.projectedRemainingBalance)}\n\nIf you spend ${formatRM(amount)}, your projected remaining balance would be ${formatRM(afterSpend)}.\n\n${
            canAfford
              ? "✅ Yes bro, you can afford it! Just be mindful of your budget."
              : "⚠️ Hmm, you might want to hold off on that one, bro. After your upcoming commitments, this would put you in the red."
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
        const assistantMsg: ChatMessage = {
          id: `a-${Date.now()}`,
          role: "assistant",
          content: `Bro, here's your budget breakdown:\n\n🐷 Monthly Budget: ${formatRM(profile.monthlyBudget)}\n💸 Spent So Far: ${formatRM(summary.totalMonthlyExpenses)}\n💰 Budget Remaining: ${formatRM(summary.budgetRemaining)}\n📊 Usage: ${Math.round((summary.totalMonthlyExpenses / profile.monthlyBudget) * 100)}%\n\n${
            summary.totalMonthlyExpenses / profile.monthlyBudget > 0.8
              ? "⚠️ You're using more than 80% of your budget. Consider reducing non-essential spending."
              : "✅ You're on track with your budget. Keep it up, bro!"
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
          content: `Bro, I'll show you your upcoming commitments in the Commitments page. You have ${formatRM(summary.upcomingCommitments)} in upcoming payments. Head over to the Commitments tab to see the full list and mark them as paid when ready.`,
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
        content: `Bro, I hear you! In the full version, I'll be able to process that request with real AI. For now, try asking me about your balance, whether you can afford something, your budget, or tell me about an expense like "Bro, I spent RM59 today."`,
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
        return "Parsing user intent and extracting key information";
      case "Planning tasks":
        return "Determining what actions are needed";
      case "Retrieving financial records":
        return "Fetching transactions, balances, and commitments";
      case "Analyzing information":
        return "Computing projections and affordability";
      case "Preparing actions":
        return "Building transaction preview for confirmation";
      case "Awaiting approval":
        return "Waiting for user to confirm or cancel";
      case "Executing actions":
        return "Applying changes to financial records";
      case "Verifying results":
        return "Confirming data integrity after action";
      default:
        return "";
    }
  }

  function animateAgentSteps(steps: AgentExecutionStep[], onComplete: () => void) {
    let currentStep = 0;
    const interval = setInterval(() => {
      if (currentStep >= steps.length) {
        clearInterval(interval);
        onComplete();
        return;
      }
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.id.startsWith("agent-progress")) {
          const updatedSteps = [...steps].map((s, i) => ({
            ...s,
            status: (i < currentStep + 1 ? "completed" : i === currentStep ? "active" : "pending") as AgentExecutionStep["status"],
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

    // Remove the preview message and add a success message
    setMessages((prev) => {
      const filtered = prev.filter((m) => m.id !== messageId);
      return [
        ...filtered,
        {
          id: `success-${Date.now()}`,
          role: "assistant" as const,
          content: `✅ Transaction confirmed and added!\n\nAmount: ${formatRM(preview.amount)}\nType: ${preview.type}\nCategory: ${preview.category}\n\nYour balance has been updated. Current balance: ${formatRM(summary.currentBalance - preview.amount)}`,
          timestamp: new Date().toISOString(),
          isDemoPreview: true,
          agentSteps: [
            { id: "ex1", step: 1, label: "Executing actions", status: "completed" as const },
            { id: "ex2", step: 2, label: "Verifying results", status: "completed" as const },
          ],
        },
      ];
    });
  };

  const handleCancelTransaction = (messageId: string) => {
    setMessages((prev) => {
      const filtered = prev.filter((m) => m.id !== messageId);
      return [
        ...filtered,
        {
          id: `cancel-${Date.now()}`,
          role: "assistant" as const,
          content: "❌ Transaction cancelled. No changes were made to your records.",
          timestamp: new Date().toISOString(),
          isDemoPreview: true,
        },
      ];
    });
  };

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6 animate-fade-in">
      <div className="flex flex-col" style={{ height: "calc(100vh - 7rem)" }}>
        {/* Header */}
        <div className="mb-4 flex items-center gap-3 rounded-2xl border border-navy-200 bg-gradient-to-r from-navy-800 to-navy-950 p-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-400 to-teal-600 shadow-lg">
            <Bot className="h-6 w-6 text-white" />
          </div>
          <div className="flex-1">
            <h2 className="text-base font-bold text-white">FinanceBro AI</h2>
            <p className="text-xs text-teal-300">Your agentic financial copilot · Demo Preview</p>
          </div>
          <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse-soft" />
            Online
          </span>
        </div>

        {/* Chat area */}
        <div className="flex-1 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4">
          <div className="space-y-4">
            {messages.map((msg) => (
              <ChatMessageBubble
                key={msg.id}
                message={msg}
                onConfirm={() => msg.transactionPreview && handleConfirmTransaction(msg.id, msg.transactionPreview)}
                onCancel={() => handleCancelTransaction(msg.id)}
              />
            ))}
            {isProcessing && !messages.some((m) => m.id.startsWith("agent-progress")) && (
              <TypingIndicator />
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Suggested prompts */}
        {showSuggestions && messages.length <= 1 && (
          <div className="mt-3 space-y-2">
            <p className="text-xs font-medium text-slate-400">Try these prompts:</p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTED_PROMPTS.map((prompt, i) => (
                <button
                  key={i}
                  onClick={() => handleSend(prompt)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-navy-700 hover:border-teal-300 hover:bg-teal-50 transition-all"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input area */}
        <div className="mt-3 flex items-end gap-2 rounded-2xl border border-slate-200 bg-white p-3 focus-within:border-teal-400 focus-within:ring-2 focus-within:ring-teal-400/20 transition-all">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Ask FinanceBro AI anything..."
            rows={1}
            className="flex-1 resize-none bg-transparent text-sm text-navy-900 placeholder:text-slate-400 focus:outline-none"
            style={{ maxHeight: "120px" }}
          />
          <Button
            onClick={() => handleSend()}
            disabled={!input.trim() || isProcessing}
            size="md"
            icon={<Send className="h-4 w-4" />}
          >
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}

function ChatMessageBubble({
  message,
  onConfirm,
  onCancel,
}: {
  message: ChatMessage;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div className="flex justify-end animate-slide-in-right">
        <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-gradient-to-br from-teal-600 to-teal-700 px-4 py-2.5 text-sm text-white shadow-sm">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3 animate-slide-up">
      {/* AI Avatar */}
      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-navy-700 to-navy-950 shadow-sm">
        <Bot className="h-5 w-5 text-teal-300" />
      </div>

      <div className="flex-1 space-y-3">
        {/* Agent Steps */}
        {message.agentSteps && message.agentSteps.length > 0 && message.content === "" && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="mb-3 flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-teal-600" />
              <span className="text-xs font-semibold text-navy-700">Agent working...</span>
            </div>
            <div className="space-y-2">
              {message.agentSteps.map((step) => (
                <AgentStepItem key={step.id} step={step} />
              ))}
            </div>
          </div>
        )}

        {/* Content */}
        {message.content && (
          <div className="rounded-2xl rounded-tl-sm border border-slate-200 bg-white px-4 py-3 text-sm text-navy-800 shadow-sm">
            <div className="whitespace-pre-line">{message.content}</div>
            {message.isDemoPreview && (
              <div className="mt-2 flex items-center gap-1 border-t border-slate-100 pt-2">
                <Sparkles className="h-3 w-3 text-amber-400" />
                <span className="text-[10px] font-medium text-amber-500">Demo Preview — Simulated response</span>
              </div>
            )}
          </div>
        )}

        {/* Transaction Preview */}
        {message.transactionPreview && (
          <TransactionPreviewCard
            preview={message.transactionPreview}
            onConfirm={onConfirm}
            onCancel={onCancel}
          />
        )}

        {/* Completed Agent Steps (shown after content) */}
        {message.agentSteps && message.agentSteps.length > 0 && message.content !== "" && (
          <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              <span className="text-xs font-semibold text-emerald-700">Agent workflow completed</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {message.agentSteps.map((step) => {
                const Icon = AGENT_STEP_ICONS[step.label] || CheckCircle2;
                return (
                  <span
                    key={step.id}
                    className="flex items-center gap-1 rounded-lg bg-white px-2 py-1 text-[10px] font-medium text-emerald-700"
                  >
                    <Icon className="h-3 w-3" />
                    {step.label}
                  </span>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function AgentStepItem({ step }: { step: AgentExecutionStep }) {
  const Icon = AGENT_STEP_ICONS[step.label] || CheckCircle2;

  if (step.status === "completed") {
    return (
      <div className="flex items-center gap-2 agent-step-enter">
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
        </div>
        <span className="text-xs font-medium text-slate-400 line-through">{step.label}</span>
      </div>
    );
  }

  if (step.status === "active") {
    return (
      <div className="flex items-center gap-2 agent-step-enter">
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-teal-100">
          <Loader2 className="h-4 w-4 animate-spin text-teal-600" />
        </div>
        <div>
          <span className="text-xs font-semibold text-navy-700">{step.label}</span>
          {step.description && (
            <p className="text-[10px] text-slate-400">{step.description}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 opacity-50">
      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100">
        <Icon className="h-3.5 w-3.5 text-slate-400" />
      </div>
      <span className="text-xs font-medium text-slate-400">{step.label}</span>
    </div>
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
    <div className="rounded-xl border-2 border-teal-200 bg-gradient-to-br from-white to-teal-50/30 p-4 animate-slide-up">
      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-100">
          <Receipt className="h-4 w-4 text-teal-600" />
        </div>
        <h4 className="text-sm font-bold text-navy-900">Transaction Preview</h4>
        <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-600">
          Awaiting Approval
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-white p-3">
          <p className="text-[10px] font-medium text-slate-400">Amount</p>
          <p className="text-lg font-bold text-rose-600">{formatRM(preview.amount)}</p>
        </div>
        <div className="rounded-lg bg-white p-3">
          <p className="text-[10px] font-medium text-slate-400">Type</p>
          <p className="text-sm font-semibold capitalize text-navy-900">{preview.type}</p>
        </div>
        <div className="rounded-lg bg-white p-3">
          <p className="text-[10px] font-medium text-slate-400">Category</p>
          <p className="text-sm font-semibold text-navy-900">{preview.category}</p>
        </div>
        <div className="rounded-lg bg-white p-3">
          <p className="text-[10px] font-medium text-slate-400">Account</p>
          <p className="text-sm font-semibold text-navy-900">{preview.account}</p>
        </div>
      </div>

      {preview.description && (
        <div className="mt-2 rounded-lg bg-white p-3">
          <p className="text-[10px] font-medium text-slate-400">Description</p>
          <p className="text-sm text-navy-700">{preview.description}</p>
        </div>
      )}

      <div className="mt-4 flex gap-2">
        <Button variant="success" size="md" onClick={onConfirm} icon={<Check className="h-4 w-4" />} className="flex-1">
          Confirm Transaction
        </Button>
        <Button variant="outline" size="md" onClick={onCancel} icon={<X className="h-4 w-4" />} className="flex-1">
          Cancel
        </Button>
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex gap-3">
      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-navy-700 to-navy-950">
        <Bot className="h-5 w-5 text-teal-300" />
      </div>
      <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-sm border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <span className="typing-dot h-2 w-2 rounded-full bg-teal-400" />
        <span className="typing-dot h-2 w-2 rounded-full bg-teal-400" />
        <span className="typing-dot h-2 w-2 rounded-full bg-teal-400" />
      </div>
    </div>
  );
}
