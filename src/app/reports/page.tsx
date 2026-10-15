"use client";

import { ReactNode, useMemo } from "react";
import { Download, Printer } from "lucide-react";
import { useFinance } from "@/lib/FinanceContext";
import { useDebtView } from "@/lib/debt/useDebtView";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { downloadCsv } from "@/lib/csv";
import { formatDate, formatDateShort, formatRM } from "@/lib/utils";
import { DebtScheduleReport, debtSchedule, monthLabel } from "@/lib/reports";

export default function ReportsPage() {
  const { profile } = useFinance();
  const { today, debts } = useDebtView();
  const schedule = useMemo(() => debtSchedule(debts, today), [debts, today]);

  return (
    <div className="mx-auto max-w-4xl px-4 pb-10 pt-2 sm:px-6 lg:px-8">
      <div className="print:hidden">
        <PageHeader title="Reports" subtitle="Every PayLater plan and each instalment still to pay. Download it or save it as a PDF." />
        <div className="mb-6 flex justify-end gap-2">
          <Button variant="secondary" size="sm" icon={<Download className="h-3.5 w-3.5" />} onClick={() => downloadCsv(`paylater-schedule-${today}.csv`, scheduleRows(schedule))}>
            CSV
          </Button>
          <Button size="sm" icon={<Printer className="h-3.5 w-3.5" />} onClick={() => window.print()}>
            Save as PDF
          </Button>
        </div>
      </div>

      {/* The report itself: what prints. */}
      <article className="animate-rise rounded-2xl bg-surface p-5 shadow-card sm:p-8 print:rounded-none print:p-0 print:shadow-none">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-2 pb-4 shadow-[inset_0_-0.5px_0_var(--separator)]">
          <div>
            <p className="text-caption font-semibold uppercase tracking-[0.14em] text-accent-text">FinanceBro report</p>
            <h2 className="mt-1 text-title1 text-label">PayLater schedule</h2>
            <p className="mt-0.5 text-subhead text-label-2">
              {profile.displayName} · As of {formatDate(today)}
            </p>
          </div>
          <p className="text-footnote text-label-3">Generated {formatDate(today)}</p>
        </header>

        <DebtReport r={schedule} today={today} />

        <p className="mt-8 text-caption text-label-3">All amounts in MYR. Only instalments still to pay are listed.</p>
      </article>
    </div>
  );
}

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
// ------------------------------------------------------------
// Debt schedule
// ------------------------------------------------------------

function DebtReport({ r, today }: { r: DebtScheduleReport; today: string }) {
  const toPay = r.months.reduce((s, m) => s + Math.round(m.total * 100), 0) / 100;
  const overdue = r.months.flatMap((m) => m.rows).filter((x) => x.overdue).reduce((s, x) => s + Math.round(x.remaining * 100), 0) / 100;

  if (r.debts.length === 0) return <p className="text-body text-label-2">No active PayLater plans. Nothing to schedule.</p>;

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

      <Section title="Each plan">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-subhead">
            <thead className="text-footnote text-label-2">
              <tr className="shadow-[inset_0_-0.5px_0_var(--separator)]">
                <th className="py-2 font-medium">Provider</th>
                <th className="py-2 pl-3 text-right font-medium">Owed</th>
                <th className="hidden py-2 pl-3 text-right font-medium sm:table-cell print:table-cell">Repayment</th>
                <th className="py-2 pl-3 text-right font-medium">Next due</th>
                <th className="hidden py-2 pl-3 text-right font-medium sm:table-cell print:table-cell">Last due</th>
              </tr>
            </thead>
            <tbody className="grouped">
              {r.debts.map((d) => (
                <tr key={d.id}>
                  <td className="py-2.5">
                    <span className="block text-label">{d.name}</span>
                    {d.bought && <span className="block text-caption text-label-2">{d.bought}</span>}
                    <span className="block text-caption text-label-2">
                      {d.frequency}
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
                      <span className="block truncate text-subhead text-label">
                        {x.debt}
                        {x.bought && <span className="text-label-2"> · {x.bought}</span>}
                      </span>
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

function scheduleRows(r: DebtScheduleReport): (string | number | undefined)[][] {
  return [
    ["Provider", "What was bought", "Frequency", "Interest % p.a.", "Outstanding", "Repayment", "Next due", "Last due", "Payments left"],
    ...r.debts.map((d) => [d.name, d.bought, d.frequency, d.interestRate, rm(d.outstanding), d.repayment != null ? rm(d.repayment) : "", d.nextDue, d.finalDue, d.instalmentsLeft]),
    [],
    ["Due date", "Provider", "Amount", "Paid", "Still to pay", "Overdue"],
    ...r.months.flatMap((m) => m.rows.map((x) => [x.dueDate, x.debt, rm(x.amount), rm(x.paid), rm(x.remaining), x.overdue ? "yes" : ""])),
  ];
}
