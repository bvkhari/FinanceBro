// Integration tests for the debt SQL functions, run against the linked
// Supabase project. They use throwaway profiles that are deleted afterwards,
// so the demo data is not touched. Skipped when the Supabase env vars are missing.

import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { generateSchedule } from "../src/lib/debt/schedule";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const STUDENT = randomUUID();
const REJECTED = randomUUID(); // a business profile the database must refuse

describe.skipIf(!url || !key)("debt payments (database)", () => {
  let db: SupabaseClient;

  beforeAll(async () => {
    db = createClient(url!, key!);
    const { error } = await db.from("profiles").insert([
      { id: STUDENT, name: "Vitest temp student", mode: "student", current_balance: 1000, created_at: "2099-01-01" },
    ]);
    if (error) throw error;
  });

  afterAll(async () => {
    await db?.from("profiles").delete().in("id", [STUDENT, REJECTED]);
  });

  async function createDebt(fields: Record<string, unknown>, schedule: { due_date: string; amount: number }[]) {
    const { data, error } = await db.rpc("create_debt", { p_debt: { profile_id: STUDENT, ...fields }, p_instalments: schedule });
    if (error) throw error;
    return data as string;
  }

  async function instalments(debtId: string) {
    const { data, error } = await db.from("debt_instalments").select("*").eq("debt_id", debtId).order("due_date");
    if (error) throw error;
    return data.map((i) => ({ ...i, amount: Number(i.amount), amount_paid: Number(i.amount_paid) }));
  }

  async function debt(debtId: string) {
    const { data, error } = await db.from("debts").select("*").eq("id", debtId).single();
    if (error) throw error;
    return { ...data, outstanding_balance: Number(data.outstanding_balance) };
  }

  async function balance() {
    const { data } = await db.from("profiles").select("current_balance").eq("id", STUDENT).single();
    return Number(data!.current_balance);
  }

  // Payment dates must not be in the future, so the default is a fixed past date.
  const pay = (instalmentId: string, amount: number, idempotencyKey = randomUUID(), interest = 0, date = "2026-10-01") =>
    db.rpc("record_debt_payment", {
      p_instalment_id: instalmentId,
      p_amount: amount,
      p_paid_date: date,
      p_idempotency_key: idempotencyKey,
      p_interest: interest,
    });

  it("walks the spec example: RM300 → RM200 → RM100 → RM0, with partial payments", async () => {
    const id = await createDebt(
      { name: "Shopee PayLater", debt_type: "bnpl", original_amount: 300, repayment_amount: 100, frequency: "monthly" },
      generateSchedule({ amount: 300, instalmentAmount: 100, frequency: "monthly", firstDueDate: "2026-10-15" })
    );
    const [oct, nov, dec] = await instalments(id);
    expect([oct.due_date, nov.due_date, dec.due_date]).toEqual(["2026-10-15", "2026-11-15", "2026-12-15"]);
    expect((await debt(id)).outstanding_balance).toBe(300);
    const startBalance = await balance();

    // Full payment of October
    const r1 = await pay(oct.id, 100);
    expect(r1.error).toBeNull();
    expect(r1.data).toMatchObject({ duplicate: false, outstanding_balance: 200, instalment_remaining: 0 });
    expect((await debt(id)).outstanding_balance).toBe(200);
    expect((await instalments(id))[0]).toMatchObject({ status: "paid", amount_paid: 100, paid_date: "2026-10-01" });
    expect(await balance()).toBe(startBalance - 100);

    // Partial payment of November: RM40, then RM60
    const r2 = await pay(nov.id, 40);
    expect(r2.error).toBeNull();
    expect((await instalments(id))[1]).toMatchObject({ status: "partial", amount_paid: 40 });
    expect((await debt(id)).outstanding_balance).toBe(160);

    const tooMuch = await pay(nov.id, 70);
    expect(tooMuch.error?.message).toMatch(/more than the RM60.00 still due/);
    expect((await debt(id)).outstanding_balance).toBe(160);

    expect((await pay(nov.id, 60)).error).toBeNull();
    expect((await instalments(id))[1]).toMatchObject({ status: "paid", amount_paid: 100 });

    // Last instalment clears the debt
    expect((await pay(dec.id, 100)).error).toBeNull();
    expect(await debt(id)).toMatchObject({ outstanding_balance: 0, status: "paid_off" });
    expect(await balance()).toBe(startBalance - 300);

    // Every payment links to exactly one 'Debt Repayment' transaction
    const { data: payments } = await db.from("debt_payments").select("transaction_id, amount").eq("debt_id", id);
    expect(payments).toHaveLength(4);
    const { data: txns } = await db.from("transactions").select("id, amount, category, direction")
      .in("id", payments!.map((p) => p.transaction_id));
    expect(txns).toHaveLength(4);
    expect(txns!.every((t) => t.category === "Debt Repayment" && t.direction === "expense")).toBe(true);
    expect(txns!.reduce((s, t) => s + Number(t.amount), 0)).toBe(300);
  });

  it("does not duplicate a payment when the same request is sent twice", async () => {
    const id = await createDebt(
      { name: "Grab PayLater", debt_type: "bnpl", original_amount: 50, frequency: "one_time" },
      [{ due_date: "2026-10-31", amount: 50 }]
    );
    const [inst] = await instalments(id);
    const key = randomUUID();

    const first = await pay(inst.id, 50, key);
    const again = await pay(inst.id, 50, key);
    expect(first.data).toMatchObject({ duplicate: false });
    expect(again.data).toMatchObject({ duplicate: true, payment_id: first.data.payment_id });

    // A second click with a new key is refused because nothing is left to pay
    const secondClick = await pay(inst.id, 50);
    expect(secondClick.error?.message).toMatch(/already paid/);

    const { count } = await db.from("debt_payments").select("*", { count: "exact", head: true }).eq("debt_id", id);
    expect(count).toBe(1);
    const { count: txnCount } = await db.from("transactions").select("*", { count: "exact", head: true })
      .eq("profile_id", STUDENT).eq("merchant", "Grab PayLater");
    expect(txnCount).toBe(1);
  });

  it("lets only one of two simultaneous payments through", async () => {
    const id = await createDebt(
      { name: "Concurrent test", debt_type: "bnpl", original_amount: 80, frequency: "one_time" },
      [{ due_date: "2026-11-01", amount: 80 }]
    );
    const [inst] = await instalments(id);
    const results = await Promise.all([pay(inst.id, 80), pay(inst.id, 80), pay(inst.id, 80)]);
    expect(results.filter((r) => !r.error)).toHaveLength(1);
    expect((await debt(id)).outstanding_balance).toBe(0);
  });

  it("records interest and fees as an expense and only principal against the balance", async () => {
    const id = await createDebt(
      { name: "Personal loan", debt_type: "bnpl", original_amount: 1000, repayment_amount: 110, frequency: "monthly", interest_rate: 12 },
      generateSchedule({ amount: 1100, instalmentAmount: 110, frequency: "monthly", firstDueDate: "2026-10-05" })
    );
    const [first] = await instalments(id);
    const r = await pay(first.id, 110, randomUUID(), 10);
    expect(r.data).toMatchObject({ principal: 100, interest: 10, outstanding_balance: 900 });

    const { data: p } = await db.from("debt_payments").select("transaction_id, interest_transaction_id").eq("debt_id", id).single();
    const { data: txns } = await db.from("transactions").select("amount, category")
      .in("id", [p!.transaction_id, p!.interest_transaction_id]).order("amount");
    expect(txns!.map((t) => [Number(t.amount), t.category])).toEqual([[10, "Interest & Fees"], [100, "Debt Repayment"]]);
  });

  it("refuses payments that would make the balance negative or that make no sense", async () => {
    const id = await createDebt(
      { name: "Mismatch", debt_type: "bnpl", original_amount: 100, outstanding_balance: 30, frequency: "irregular" },
      [{ due_date: "2026-10-20", amount: 50 }]
    );
    const [inst] = await instalments(id);
    expect((await pay(inst.id, 50)).error?.message).toMatch(/more than the RM30.00 still owed/);
    expect((await pay(inst.id, 0)).error?.message).toMatch(/more than RM0/);
    expect((await pay(inst.id, 10, randomUUID(), 20)).error?.message).toMatch(/Interest and fees/);
    expect((await debt(id)).outstanding_balance).toBe(30);
  });

  it("adds new instalments without duplicating or touching existing ones", async () => {
    const id = await createDebt(
      { name: "Card", debt_type: "bnpl", original_amount: 300, repayment_amount: 100, frequency: "monthly" },
      generateSchedule({ amount: 200, instalmentAmount: 100, frequency: "monthly", firstDueDate: "2026-10-01" })
    );
    const [oct] = await instalments(id);
    await pay(oct.id, 100);

    const { data: added, error } = await db.rpc("add_debt_instalments", {
      p_debt_id: id,
      p_instalments: [
        { due_date: "2026-10-01", amount: 999 }, // already exists (and is paid): skipped
        { due_date: "2026-12-01", amount: 100 },
      ],
    });
    expect(error).toBeNull();
    expect(added).toBe(1);
    const rows = await instalments(id);
    expect(rows.map((i) => [i.due_date, i.amount, i.status])).toEqual([
      ["2026-10-01", 100, "paid"],
      ["2026-11-01", 100, "scheduled"],
      ["2026-12-01", 100, "scheduled"],
    ]);
  });

  it("cancels unpaid instalments once the balance reaches zero", async () => {
    // Schedule (RM200) is larger than what is owed (RM100), e.g. a debt partly settled elsewhere
    const id = await createDebt(
      { name: "Over-scheduled", debt_type: "bnpl", original_amount: 200, outstanding_balance: 100, frequency: "irregular" },
      [{ due_date: "2026-10-20", amount: 100 }, { due_date: "2026-11-20", amount: 100 }]
    );
    const [first] = await instalments(id);
    expect((await pay(first.id, 100)).error).toBeNull();
    expect((await debt(id)).status).toBe("paid_off");
    expect((await instalments(id)).map((i) => i.status)).toEqual(["paid", "cancelled"]);
  });

  it("refuses payment dates in the future", async () => {
    const id = await createDebt(
      { name: "Future date", debt_type: "bnpl", original_amount: 50, frequency: "one_time" },
      [{ due_date: "2026-10-20", amount: 50 }]
    );
    const [inst] = await instalments(id);
    const r = await pay(inst.id, 50, randomUUID(), 0, "2099-01-01");
    expect(r.error?.message).toMatch(/in the future/);
    expect((await debt(id)).outstanding_balance).toBe(50);
  });

  it("records a purchase on credit as an expense that doesn't move cash, counted once", async () => {
    const before = await balance();
    const id = await createDebt(
      {
        name: "Credit purchase", debt_type: "bnpl", original_amount: 300, repayment_amount: 100, frequency: "monthly",
        purchase: { txn_date: "2026-09-15", category: "Shopping", note: "Earbuds" },
      },
      generateSchedule({ amount: 300, instalmentAmount: 100, frequency: "monthly", firstDueDate: "2026-10-05" })
    );
    const d = await debt(id);
    const { data: purchase } = await db.from("transactions").select("*").eq("id", d.purchase_transaction_id).single();
    expect(purchase).toMatchObject({ direction: "expense", category: "Shopping", cash_effect: false, txn_date: "2026-09-15", note: "Earbuds" });
    expect(Number(purchase!.amount)).toBe(300);
    expect(await balance()).toBe(before); // buying on credit didn't move cash

    const [first] = await instalments(id);
    await pay(first.id, 100);
    expect(await balance()).toBe(before - 100); // repaying did

    // Spending = the purchase only; the repayment is cash, not spending
    const { data: rows } = await db.from("transactions").select("category, amount, cash_effect").eq("profile_id", STUDENT).eq("merchant", "Credit purchase");
    const spending = rows!.filter((r) => r.category !== "Debt Repayment").reduce((s, r) => s + Number(r.amount), 0);
    const cashOut = rows!.filter((r) => r.cash_effect).reduce((s, r) => s + Number(r.amount), 0);
    expect(spending).toBe(300);
    expect(cashOut).toBe(100);
  });

  it("moves the balance when a transaction switches between cash and credit", async () => {
    const before = await balance();
    const { data: t } = await db.from("transactions").insert({
      profile_id: STUDENT, txn_date: "2026-10-01", amount: 25, direction: "expense", category: "Food", merchant: "Toggle", cash_effect: false,
    }).select().single();
    expect(await balance()).toBe(before);
    await db.from("transactions").update({ cash_effect: true }).eq("id", t!.id);
    expect(await balance()).toBe(before - 25);
    await db.from("transactions").delete().eq("id", t!.id);
    expect(await balance()).toBe(before);
  });

  describe("editing the schedule", () => {
    const rpc = (fn: string, args: Record<string, unknown>) => db.rpc(fn, args);

    it("edits an unpaid instalment but never a paid one", async () => {
      const id = await createDebt(
        { name: "Edit test", debt_type: "bnpl", original_amount: 300, repayment_amount: 100, frequency: "monthly" },
        generateSchedule({ amount: 300, instalmentAmount: 100, frequency: "monthly", firstDueDate: "2026-10-01" })
      );
      const [oct, nov, dec] = await instalments(id);
      await pay(oct.id, 100);

      expect((await rpc("update_debt_instalment", { p_instalment_id: nov.id, p_due_date: "2026-11-20", p_amount: 150 })).error).toBeNull();
      const after = await instalments(id);
      expect(after.map((i) => [i.due_date, i.amount, i.status])).toEqual([
        ["2026-10-01", 100, "paid"],
        ["2026-11-20", 150, "scheduled"],
        ["2026-12-01", 100, "scheduled"],
      ]);

      const paidEdit = await rpc("update_debt_instalment", { p_instalment_id: oct.id, p_due_date: "2026-10-05", p_amount: 50 });
      expect(paidEdit.error?.message).toMatch(/paid instalment can't be changed/);
      const clash = await rpc("update_debt_instalment", { p_instalment_id: dec.id, p_due_date: "2026-11-20", p_amount: 100 });
      expect(clash.error?.message).toMatch(/already due on 2026-11-20/);
      expect((await instalments(id))[0]).toMatchObject({ due_date: "2026-10-01", amount: 100, status: "paid" });
    });

    it("never lowers a partly paid instalment below what was paid", async () => {
      const id = await createDebt(
        { name: "Partial edit", debt_type: "bnpl", original_amount: 100, frequency: "one_time" },
        [{ due_date: "2026-10-02", amount: 100 }]
      );
      const [inst] = await instalments(id);
      await pay(inst.id, 40);
      const tooLow = await rpc("update_debt_instalment", { p_instalment_id: inst.id, p_due_date: "2026-10-02", p_amount: 30 });
      expect(tooLow.error?.message).toMatch(/less than the RM40.00 already paid/);
      expect((await rpc("cancel_debt_instalment", { p_instalment_id: inst.id })).error?.message).toMatch(/already has RM40.00 paid/);
      // Lowering it to exactly what was paid settles it
      await rpc("update_debt_instalment", { p_instalment_id: inst.id, p_due_date: "2026-10-02", p_amount: 40 });
      expect((await instalments(id))[0]).toMatchObject({ amount: 40, amount_paid: 40, status: "paid" });
    });

    it("cancels an unpaid instalment and keeps it as history", async () => {
      const id = await createDebt(
        { name: "Cancel test", debt_type: "bnpl", original_amount: 200, frequency: "irregular" },
        [{ due_date: "2026-10-25", amount: 80 }, { due_date: "2026-11-25", amount: 120 }]
      );
      const [first] = await instalments(id);
      expect((await rpc("cancel_debt_instalment", { p_instalment_id: first.id })).error).toBeNull();
      expect((await instalments(id)).map((i) => i.status)).toEqual(["cancelled", "scheduled"]);
      expect((await debt(id)).outstanding_balance).toBe(200); // cancelling a payment doesn't change what is owed
      expect((await rpc("cancel_debt_instalment", { p_instalment_id: first.id })).error?.message).toMatch(/already cancelled/);
    });

    it("reschedules what's left without touching paid or partly paid instalments", async () => {
      const id = await createDebt(
        { name: "Reschedule", debt_type: "bnpl", original_amount: 400, repayment_amount: 100, frequency: "monthly" },
        generateSchedule({ amount: 400, instalmentAmount: 100, frequency: "monthly", firstDueDate: "2026-09-01" })
      );
      const [sep, oct] = await instalments(id);
      await pay(sep.id, 100, randomUUID(), 0, "2026-09-01");
      await pay(oct.id, 30, randomUUID(), 0, "2026-10-01"); // RM70 still due on October
      // Owed: 400 − 100 − 30 = 270. October keeps its RM70, so the new schedule covers RM200, every two weeks at RM100
      const fresh = generateSchedule({ amount: 200, instalmentAmount: 100, frequency: "biweekly", firstDueDate: "2026-11-02" });
      const r = await rpc("reschedule_debt", { p_debt_id: id, p_frequency: "biweekly", p_repayment_amount: 100, p_instalments: fresh });
      expect(r.error).toBeNull();
      expect(r.data).toBe(2);
      expect((await instalments(id)).map((i) => [i.due_date, i.amount, i.amount_paid, i.status])).toEqual([
        ["2026-09-01", 100, 100, "paid"],
        ["2026-10-01", 100, 30, "partial"],
        ["2026-11-02", 100, 0, "scheduled"],
        ["2026-11-16", 100, 0, "scheduled"],
      ]);
      expect(await debt(id)).toMatchObject({ frequency: "biweekly", repayment_amount: 100, outstanding_balance: 270 });
    });

    it("refuses a new schedule that lands on a paid date, and changes nothing", async () => {
      const id = await createDebt(
        { name: "Clash", debt_type: "bnpl", original_amount: 200, repayment_amount: 100, frequency: "monthly" },
        generateSchedule({ amount: 200, instalmentAmount: 100, frequency: "monthly", firstDueDate: "2026-09-01" })
      );
      const [sep] = await instalments(id);
      await pay(sep.id, 100, randomUUID(), 0, "2026-09-01");
      const before = await instalments(id);
      const r = await rpc("reschedule_debt", {
        p_debt_id: id, p_frequency: "one_time", p_repayment_amount: null, p_instalments: [{ due_date: "2026-09-01", amount: 100 }],
      });
      expect(r.error?.message).toMatch(/already paid or cancelled is due on 2026-09-01/);
      expect(await instalments(id)).toEqual(before);
      expect((await debt(id)).frequency).toBe("monthly");
    });
  });

  it("only accepts BNPL debts and student profiles", async () => {
    await expect(
      createDebt({ name: "Maybank card", debt_type: "credit_card", original_amount: 10, frequency: "one_time" }, [
        { due_date: "2026-10-20", amount: 10 },
      ])
    ).rejects.toMatchObject({ message: expect.stringMatching(/debts_debt_type_check/) });

    const { error } = await db.from("profiles").insert({ id: REJECTED, name: "Vitest temp business", mode: "business", created_at: "2099-01-01" });
    expect(error?.message).toMatch(/profiles_mode_check/);
  });
});
