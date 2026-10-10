"use client";

import { useRouter } from "next/navigation";
import { useFinance } from "@/lib/FinanceContext";
import { AppMode } from "@/lib/types";
import { Wallet, User, Store, ArrowRight } from "lucide-react";

const options: {
  mode: AppMode;
  title: string;
  description: string;
  icon: typeof User;
}[] = [
  {
    mode: "individual",
    title: "Individual",
    description: "Students and personal budgets: track spending, PTPTN, BNPL plans and bills.",
    icon: User,
  },
  {
    mode: "business",
    title: "Business",
    description: "Small business owners: track revenue, supplier payments and cash flow.",
    icon: Store,
  },
];

export default function HelloPage() {
  const router = useRouter();
  const { setMode } = useFinance();

  const choose = (mode: AppMode) => {
    setMode(mode);
    router.push("/dashboard");
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 py-12 animate-fade-in">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-400 to-teal-600 shadow-lg">
        <Wallet className="h-7 w-7 text-white" />
      </div>
      <h1 className="mt-5 text-center text-3xl font-extrabold text-navy-900 sm:text-4xl">
        Hello, welcome to FinanceBro 👋
      </h1>
      <p className="mt-2 text-center text-sm text-slate-500 sm:text-base">
        Your agentic financial copilot. How will you use FinanceBro today?
      </p>

      <div className="mt-10 grid w-full max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2">
        {options.map(({ mode, title, description, icon: Icon }) => (
          <button
            key={mode}
            onClick={() => choose(mode)}
            className="group flex flex-col items-start rounded-2xl border border-slate-200 bg-white p-6 text-left transition-all hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-lg active:translate-y-0"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-teal-50 text-teal-600 transition-colors group-hover:bg-teal-500 group-hover:text-white">
              <Icon className="h-6 w-6" />
            </div>
            <h2 className="mt-4 text-lg font-bold text-navy-900">{title}</h2>
            <p className="mt-1 text-sm text-slate-500">{description}</p>
            <span className="mt-5 flex items-center gap-1 text-sm font-semibold text-teal-600">
              Continue
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
