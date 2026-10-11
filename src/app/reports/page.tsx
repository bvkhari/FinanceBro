"use client";

import { ReactNode, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Printer } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { useFinance } from "@/lib/FinanceContext";
import { useDebtView } from "@/lib/debt/useDebtView";
import { PageHeader } from "@/components/ui/PageHeader";
import { Segmented } from "@/components/ui/Segmented";
import { Button } from "@/components/ui/Button";
import { categoryColor } from "@/lib/categories";
import { downloadCsv } from "@/lib/csv";
import { formatDate, formatDateShort, formatRM } from "@/lib/utils";
import { endOfMonth } from "@/lib/debt/payments";
import {
  CategoryRow,
  DebtScheduleReport,
  MonthlySummary,
  debtSchedule,
  monthLabel,
  monthlySummary,
  reportMonths,
  spendingByCategory,
} from "@/lib/reports";

type Kind = "monthly" | "spending" | "debts";

const TITLES: Record<Kind, string> = {
  monthly: "Monthly summary",
  spending: "Spending by category",
  debts: "Debt schedule",
};

export default function ReportsPage() {
  const { mode, setMode, profile, transactions, commitments, balances } = useFinance();
  const { today, debts } = useDebtView();
  const [kind, setKind] = useState<Kind>("monthly");
  const months = useMemo(() => reportMonths(transactions, today), [transactions, today]);
  const [month, setMonth] = useState(today.slice(0, 7));

  // Links from the agent open a specific report: /reports?kind=spending&month=2026-09&mode=business
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const k = q.get("kind");
    if (k === "monthly" || k === "spending" || k === "debts") setKind(k);
    const m = q.get("month");
    if (m && /^\d{4}-\d{2}$/.test(m)) setMonth(m);
    const md = q.get("mode");
    if (md === "individual" || md === "business") setMode(md);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const idx = Math.max(0, months.indexOf(month));

  const summary = useMemo(() => monthlySummary(transactions, balances[mode], commitments, month), [transactions, balances, mode, commitments, month]);
  const categories = useMemo(() => spendingByCategory(transactions, month), [transactions, month]);
  const schedule = useMemo(() => debtSchedule(debts, today), [debts, today]);

  const who = `${profile.displayName} · ${mode === "business" ? "Business" : "Personal"}`;
  const period = kind === "debts" ? `As of ${formatDate(today)}` : monthLabel(month);

  const exportCsv = () => {
    const slug = `${kind}-${kind === "debts" ? today : month}`;
    if (kind === "monthly") downloadCsv(`monthly-summary-${slug}.csv`, monthlyRows(summary));
    if (kind === "spending") downloadCsv(`spending-${slug}.csv`, spendingRows(categories, month));
    if (kind === "debts") downloadCsv(`debt-schedule-${today}.csv`, scheduleRows(schedule));
  };

  return (
    <div className="mx-auto max-w-4xl px-4 pb-10 pt-2 sm:px-6 lg:px-8">
      <div className="print:hidden">
        <PageHeader title="Reports" subtitle="Pick a report and a month, then download it or save it as a PDF." />

        <div className="mb-6 space-y-3">
          <Segmented<Kind>
            aria-label="Report"
            className="w-full sm:w-[26rem]"
            value={kind}
            onChange={setKind}
            options={[
              { value: "monthly", label: "Monthly" },
              { value: "spending", label: "Spending" },
              { value: "debts", label: "Debts" },
            ]}
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            {kind === "debts" ? (
              <p className="px-1 text-subhead text-label-2">Every active debt and each payment still to make.</p>
            ) : (
              <div className="flex items-center gap-1 rounded-xl bg-gray/12 p-1">
                <StepButton label="Earlier month" disabled={idx >= months.length - 1} onClick={() => setMonth(months[idx + 1])}>
                  <ChevronLeft className="h-4 w-4" />
                </StepButton>
                <label className="relative">
                  <span className="sr-only">Month</span>
                  <select
                    value={month}
                    onChange={(e) => setMonth(e.target.value)}
                    className="h-8 cursor-pointer appearance-none rounded-lg bg-transparent px-2 text-center text-headline text-label outline-none"
                  >
                    {months.map((m) => (
                      <option key={m} value={m}>
                        {monthLabel(m)}
                      </option>
                    ))}
                  </select>
                </label>
                <StepButton label="Later month" disabled={idx <= 0} onClick={() => setMonth(months[idx - 1])}>
                  <ChevronRight className="h-4 w-4" />
                </StepButton>
              </div>
            )}
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" icon={<Download className="h-3.5 w-3.5" />} onClick={exportCsv}>
                CSV
              </Button>
              <Button size="sm" icon={<Printer className="h-3.5 w-3.5" />} onClick={() => window.print()}>
                Save as PDF
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* The report itself: what prints. */}
      <article className="animate-rise rounded-2xl bg-surface p-5 shadow-card sm:p-8 print:rounded-none print:p-0 print:shadow-none" key={`${kind}-${month}-${mode}`}>
        <header className="mb-6 flex flex-wrap items-end justify-between gap-2 pb-4 shadow-[inset_0_-0.5px_0_var(--separator)]">
          <div>
            <p className="text-caption font-semibold uppercase tracking-[0.14em] text-accent-text">FinanceBro report</p>
            <h2 className="mt-1 text-title1 text-label">{TITLES[kind]}</h2>
            <p className="mt-0.5 text-subhead text-label-2">
              {who} · {period}
            </p>
          </div>
          <p className="text-footnote text-label-3">Generated {formatDate(today)}</p>
        </header>

        {kind === "monthly" && <MonthlyReport s={summary} today={today} />}
        {kind === "spending" && <SpendingReport rows={categories} month={month} />}
        {kind === "debts" && <DebtReport r={schedule} today={today} />}

        <p className="mt-8 text-caption text-label-3">
          All amounts in MYR. Debt repayments move cash but aren&apos;t spending: the purchase was counted when it was made.
        </p>
      </article>
    </div>
  );
}

function StepButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="press flex h-8 w-8 items-center justify-center rounded-lg text-label hover:bg-gray/12 disabled:opacity-30"
    >
      {children}
    </button>
  );
}

// ------------------------------------------------------------
// Building blocks
// ------------------------------------------------------------

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8 break-inside-avoid first:mt-0">
      <h3 className="mb-3 text-headline text-label">{title}</h3>
      {children}
    </section>
  );
}

function Kpi({ label, value, note, tone }: { label: string; value: number | string; note?: ReactNode; tone?: "negative" | "positive" }) {
  return (
    <div className="rounded-xl bg-gray/7 p-3.5">
      <p className="text-footnote text-label-2">{label}</p>
      <p className={`tabular mt-1 ${typeof value === "number" ? "text-title3" : "text-headline"} ${tone === "negative" ? "text-negative" : tone === "positive" ? "text-positive" : "text-label"}`}>
        {typeof value === "number" ? formatRM(value) : value}
      </p>
      {note && <p className="mt-0.5 text-caption text-label-2">{note}</p>}
    </div>
  );
}

/** "+12% vs last month", "new", or nothing when both months are empty. */
function change(now: number, before: number): { text: string; up: boolean } | null {
  if (before === 0) return now > 0 ? { text: "New this month", up: true } : null;
  const pct = Math.round(((now - before) / before) * 100);
  return { text: `${pct > 0 ? "+" : pct < 0 ? "−" : ""}${Math.abs(pct)}% vs last month`, up: pct > 0 };
}

function Bars({ rows }: { rows: CategoryRow[] }) {
  const max = Math.max(...rows.map((r) => r.amount), 1);
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.category}>
          <div className="flex items-baseline justify-between gap-3 text-subhead">
            <span className="truncate text-label">{r.category}</span>
            <span className="tabular shrink-0 text-label">
              {formatRM(r.amount)} <span className="text-label-2">· {r.share}%</span>
            </span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray/12">
            <div className="h-full rounded-full" style={{ width: `${(r.amount / max) * 100}%`, background: categoryColor(r.category) }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

// ------------------------------------------------------------
// Monthly summary
// ------------------------------------------------------------

function MonthlyReport({ s, today }: { s: MonthlySummary; today: string }) {
  const current = s.month === today.slice(0, 7);
  const start = `${s.month}-01`;
  const end = current ? today : endOfMonth(start);
  const delta = change(s.spending, s.previousSpending);
  const spent = s.categories.filter((c) => c.amount > 0);

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Income" value={s.income} tone={s.income > 0 ? "positive" : undefined} />
        <Kpi label="Spending" value={s.spending} note={delta?.text} />
        <Kpi label="Net" value={s.net} tone={s.net < 0 ? "negative" : undefined} note={s.savingsRate != null ? `Kept ${s.savingsRate}% of income` : "No income this month"} />
        <Kpi label={current ? "Cash now" : "Closing cash"} value={s.closingCash} tone={s.closingCash < 0 ? "negative" : undefined} />
      </div>

      <Section title="Cash statement">
        <dl className="grouped overflow-hidden rounded-xl bg-gray/7 px-4">
          <Line label={`Cash on ${formatDateShort(start)}`} value={s.openingCash} />
          <Line label="Income received" value={s.income} sign="+" />
          <Line label="Spending paid in cash" value={s.cashSpending} sign="−" />
          <Line label="Debt repayments" value={s.debtRepayments} sign="−" />
          <Line label={`Cash on ${formatDateShort(end)}`} value={s.closingCash} strong />
        </dl>
        <ul className="mt-2 space-y-1 px-1 text-footnote text-label-2">
          {s.spentOnCredit > 0 && <li>{formatRM(s.spentOnCredit)} was bought on credit: counted as spending, paid later.</li>}
          {s.interestFees > 0 && <li>{formatRM(s.interestFees)} went on interest and fees.</li>}
          <li>{s.transactionCount} transactions this month.</li>
        </ul>
      </Section>

      <Section title="Where it went">
        {spent.length === 0 ? <p className="text-subhead text-label-2">No spending this month.</p> : <Bars rows={spent.slice(0, 6)} />}
      </Section>

      {s.biggest.length > 0 && (
        <Section title="Biggest expenses">
          <ul className="grouped overflow-hidden rounded-xl bg-gray/7">
            {s.biggest.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="min-w-0">
                  <span className="block truncate text-body text-label">{t.name}</span>
                  <span className="block text-footnote text-label-2">
                    {t.category} · {formatDateShort(t.date)}
                    {!t.cashEffect && " · on credit"}
                  </span>
                </span>
                <span className="tabular shrink-0 text-body font-medium">{formatRM(t.amount)}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {s.billsDue > 0 && (
        <Section title="Bills">
          <p className="text-body text-label">
            <span className="tabular font-semibold">{formatRM(s.billsPaid)}</span> paid of{" "}
            <span className="tabular font-semibold">{formatRM(s.billsDue)}</span> due this month.
          </p>
        </Section>
      )}
    </>
  );
}

function Line({ label, value, sign, strong }: { label: string; value: number; sign?: "+" | "−"; strong?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 ${strong ? "py-3" : "py-2.5"}`}>
      <dt className={strong ? "text-headline" : "text-body text-label-2"}>{label}</dt>
      <dd className={`tabular ${strong ? `text-title3 ${value < 0 ? "text-negative" : ""}` : "text-body"}`}>
        {sign && value !== 0 ? sign : ""}
        {formatRM(value)}
      </dd>
    </div>
  );
}

// ------------------------------------------------------------
// Spending by category
// ------------------------------------------------------------

function SpendingReport({ rows, month }: { rows: CategoryRow[]; month: string }) {
  const spent = rows.filter((r) => r.amount > 0);
  const total = spent.reduce((s, r) => s + Math.round(r.amount * 100), 0) / 100;
  const previous = rows.reduce((s, r) => s + Math.round(r.previous * 100), 0) / 100;
  const delta = change(total, previous);

  return (
    <>
      <div className="flex flex-col items-center gap-6 sm:flex-row">
        <div className="relative h-40 w-40 shrink-0">
          {spent.length > 0 && (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={spent} dataKey="amount" nameKey="category" innerRadius="78%" outerRadius="100%" paddingAngle={1.5} stroke="none" cornerRadius={4} isAnimationActive={false}>
                  {spent.map((r) => (
                    <Cell key={r.category} fill={categoryColor(r.category)} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          )}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <p className="text-caption font-semibold uppercase tracking-[0.1em] text-label-2">Spent</p>
            <p className="tabular text-headline">{formatRM(total)}</p>
          </div>
        </div>
        <div className="w-full">
          <p className="text-body text-label">
            {monthLabel(month)}: <span className="tabular font-semibold">{formatRM(total)}</span> across {spent.length} categor{spent.length === 1 ? "y" : "ies"}.
          </p>
          {delta && (
            <p className={`mt-0.5 text-subhead ${delta.up ? "text-negative" : "text-positive"}`}>
              {delta.text} ({formatRM(previous)})
            </p>
          )}
          {spent[0] && (
            <p className="mt-2 text-subhead text-label-2">
              Biggest: {spent[0].category}, {spent[0].share}% of the month.
            </p>
          )}
        </div>
      </div>

      <Section title="By category">
        {rows.length === 0 ? (
          <p className="text-subhead text-label-2">No spending this month or last.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-subhead">
              <thead className="text-footnote text-label-2">
                <tr className="shadow-[inset_0_-0.5px_0_var(--separator)]">
                  <th className="py-2 font-medium">Category</th>
                  <th className="hidden py-2 pl-3 text-right font-medium sm:table-cell print:table-cell">Items</th>
                  <th className="py-2 pl-3 text-right font-medium">Amount</th>
                  <th className="hidden py-2 pl-3 text-right font-medium sm:table-cell print:table-cell">Share</th>
                  <th className="py-2 pl-3 text-right font-medium">Last month</th>
                </tr>
              </thead>
              <tbody className="grouped">
                {rows.map((r) => {
                  const d = change(r.amount, r.previous);
                  return (
                    <tr key={r.category}>
                      <td className="py-2.5">
                        <span className="flex items-center gap-2">
                          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: categoryColor(r.category) }} />
                          {r.category}
                        </span>
                      </td>
                      <td className="tabular hidden py-2.5 pl-3 text-right text-label-2 sm:table-cell print:table-cell">{r.count}</td>
                      <td className="tabular whitespace-nowrap py-2.5 pl-3 text-right font-medium">{formatRM(r.amount)}</td>
                      <td className="tabular hidden py-2.5 pl-3 text-right text-label-2 sm:table-cell print:table-cell">{r.share}%</td>
                      <td className="tabular whitespace-nowrap py-2.5 pl-3 text-right">
                        <span className="text-label-2">{formatRM(r.previous)}</span>
                        {d && r.previous > 0 && r.amount !== r.previous && (
                          <span className={`block text-caption ${d.up ? "text-negative" : "text-positive"}`}>{d.text.replace(" vs last month", "")}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="shadow-[inset_0_0.5px_0_var(--separator)]">
                  <td className="py-2.5 font-semibold">Total</td>
                  <td className="tabular hidden py-2.5 pl-3 text-right sm:table-cell print:table-cell">{rows.reduce((s, r) => s + r.count, 0)}</td>
                  <td className="tabular whitespace-nowrap py-2.5 pl-3 text-right font-semibold">{formatRM(total)}</td>
                  <td className="tabular hidden py-2.5 pl-3 text-right sm:table-cell print:table-cell">{total > 0 ? "100%" : "—"}</td>
                  <td className="tabular whitespace-nowrap py-2.5 pl-3 text-right text-label-2">{formatRM(previous)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Section>
    </>
  );
}

// ------------------------------------------------------------
// Debt schedule
// ------------------------------------------------------------

function DebtReport({ r, today }: { r: DebtScheduleReport; today: string }) {
  const toPay = r.months.reduce((s, m) => s + Math.round(m.total * 100), 0) / 100;
  const overdue = r.months.flatMap((m) => m.rows).filter((x) => x.overdue).reduce((s, x) => s + Math.round(x.remaining * 100), 0) / 100;

  if (r.debts.length === 0) return <p className="text-body text-label-2">No active debts. Nothing to schedule.</p>;

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Total outstanding" value={r.totalOutstanding} />
        <Kpi label="Scheduled to pay" value={toPay} note={`${r.months.reduce((s, m) => s + m.rows.length, 0)} payments`} />
        <Kpi label="Overdue" value={overdue} tone={overdue > 0 ? "negative" : undefined} />
        <Kpi label="Last payment" value={r.months.length ? monthLabel(r.months[r.months.length - 1].month) : "—"} note="If every payment is made on time" />
      </div>
      {r.unscheduled > 0 && (
        <p className="mt-2 px-1 text-footnote text-warning">
          {formatRM(r.unscheduled)} is owed with no payment date yet, so it isn&apos;t in the schedule below.
        </p>
      )}

      <Section title="Each debt">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-subhead">
            <thead className="text-footnote text-label-2">
              <tr className="shadow-[inset_0_-0.5px_0_var(--separator)]">
                <th className="py-2 font-medium">Debt</th>
                <th className="py-2 pl-3 text-right font-medium">Owed</th>
                <th className="hidden py-2 pl-3 text-right font-medium sm:table-cell print:table-cell">Repayment</th>
                <th className="py-2 pl-3 text-right font-medium">Next due</th>
                <th className="hidden py-2 pl-3 text-right font-medium sm:table-cell print:table-cell">Last due</th>
              </tr>
            </thead>
            <tbody className="grouped">
              {r.debts.map((d) => (
                <tr key={d.name}>
                  <td className="py-2.5">
                    <span className="block text-label">{d.name}</span>
                    <span className="block text-caption text-label-2">
                      {d.type} · {d.frequency}
                      {d.interestRate != null ? ` · ${d.interestRate}% p.a.` : ""}
                    </span>
                    <span className="block text-caption text-label-2 sm:hidden print:hidden">
                      {d.instalmentsLeft} left{d.finalDue ? ` · until ${formatDateShort(d.finalDue)}` : ""}
                    </span>
                  </td>
                  <td className="tabular whitespace-nowrap py-2.5 pl-3 text-right font-medium">{formatRM(d.outstanding)}</td>
                  <td className="tabular hidden whitespace-nowrap py-2.5 pl-3 text-right text-label-2 sm:table-cell print:table-cell">{d.repayment ? formatRM(d.repayment) : "Varies"}</td>
                  <td className={`tabular whitespace-nowrap py-2.5 pl-3 text-right ${d.nextDue && d.nextDue < today ? "text-negative" : ""}`}>{d.nextDue ? formatDateShort(d.nextDue) : "—"}</td>
                  <td className="tabular hidden whitespace-nowrap py-2.5 pl-3 text-right text-label-2 sm:table-cell print:table-cell">
                    {d.finalDue ? formatDateShort(d.finalDue) : "—"}
                    <span className="block text-caption">{d.instalmentsLeft} left</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Month by month">
        <div className="space-y-4">
          {r.months.map((m) => (
            <div key={m.month} className="break-inside-avoid overflow-hidden rounded-xl bg-gray/7">
              <div className="flex items-baseline justify-between px-4 pb-1.5 pt-3">
                <p className="text-headline">{monthLabel(m.month)}</p>
                <p className="tabular text-headline">{formatRM(m.total)}</p>
              </div>
              <ul className="grouped">
                {m.rows.map((x, i) => (
                  <li key={`${x.debt}-${x.dueDate}-${i}`} className="flex items-center justify-between gap-3 px-4 py-2">
                    <span className="min-w-0">
                      <span className="block truncate text-subhead text-label">{x.debt}</span>
                      <span className={`block text-caption ${x.overdue ? "font-medium text-negative" : "text-label-2"}`}>
                        {formatDateShort(x.dueDate)}
                        {x.overdue ? " · overdue" : ""}
                        {x.paid > 0 ? ` · ${formatRM(x.paid)} paid` : ""}
                      </span>
                    </span>
                    <span className="tabular shrink-0 text-subhead font-medium">{formatRM(x.remaining)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}

// ------------------------------------------------------------
// CSV
// ------------------------------------------------------------

const rm = (n: number) => n.toFixed(2);

function monthlyRows(s: MonthlySummary): (string | number | undefined)[][] {
  return [
    ["Monthly summary", monthLabel(s.month)],
    [],
    ["Cash at start", rm(s.openingCash)],
    ["Income received", rm(s.income)],
    ["Spending paid in cash", rm(s.cashSpending)],
    ["Debt repayments", rm(s.debtRepayments)],
    ["Cash at end", rm(s.closingCash)],
    [],
    ["Total spending", rm(s.spending)],
    ["Bought on credit", rm(s.spentOnCredit)],
    ["Interest and fees", rm(s.interestFees)],
    ["Net (income − spending)", rm(s.net)],
    ["Bills due", rm(s.billsDue)],
    ["Bills paid", rm(s.billsPaid)],
    [],
    ["Category", "Amount", "Share %", "Last month"],
    ...s.categories.map((c) => [c.category, rm(c.amount), c.share, rm(c.previous)]),
  ];
}

function spendingRows(rows: CategoryRow[], month: string): (string | number | undefined)[][] {
  return [
    ["Spending by category", monthLabel(month)],
    [],
    ["Category", "Items", "Amount", "Share %", "Last month"],
    ...rows.map((r) => [r.category, r.count, rm(r.amount), r.share, rm(r.previous)]),
  ];
}

function scheduleRows(r: DebtScheduleReport): (string | number | undefined)[][] {
  return [
    ["Debt", "Type", "Frequency", "Interest % p.a.", "Outstanding", "Repayment", "Next due", "Last due", "Payments left"],
    ...r.debts.map((d) => [d.name, d.type, d.frequency, d.interestRate, rm(d.outstanding), d.repayment != null ? rm(d.repayment) : "", d.nextDue, d.finalDue, d.instalmentsLeft]),
    [],
    ["Due date", "Debt", "Amount", "Paid", "Still to pay", "Overdue"],
    ...r.months.flatMap((m) => m.rows.map((x) => [x.dueDate, x.debt, rm(x.amount), rm(x.paid), rm(x.remaining), x.overdue ? "yes" : ""])),
  ];
}
