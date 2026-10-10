import { AppMode, BusinessDebtType, DebtFrequency, DebtType, InstalmentStatus, PersonalDebtType } from "../types";

export const PERSONAL_DEBT_TYPES: Record<PersonalDebtType, string> = {
  bnpl: "Buy Now, Pay Later",
  credit_card: "Credit card",
  personal_loan: "Personal loan",
  car_loan: "Car loan",
  housing_loan: "Housing loan",
  student_loan: "Student loan",
  family_friend: "Family / friends",
  other_personal: "Other",
};

export const BUSINESS_DEBT_TYPES: Record<BusinessDebtType, string> = {
  business_loan: "Business loan",
  business_credit_card: "Business credit card",
  equipment_financing: "Equipment financing",
  supplier_invoice: "Supplier invoice",
  overdraft: "Overdraft",
  other_business: "Other liability",
};

export const DEBT_TYPE_LABELS: Record<DebtType, string> = { ...PERSONAL_DEBT_TYPES, ...BUSINESS_DEBT_TYPES };

export const debtTypesFor = (mode: AppMode) =>
  Object.entries(mode === "business" ? BUSINESS_DEBT_TYPES : PERSONAL_DEBT_TYPES).map(([value, label]) => ({
    value: value as DebtType,
    label,
  }));

export const FREQUENCY_LABELS: Record<DebtFrequency, string> = {
  one_time: "One-time",
  weekly: "Weekly",
  biweekly: "Every two weeks",
  monthly: "Monthly",
  yearly: "Yearly",
  irregular: "Irregular (enter each payment)",
};

export const INSTALMENT_STATUS_STYLE: Record<InstalmentStatus, { label: string; className: string }> = {
  upcoming: { label: "Upcoming", className: "bg-amber-50 text-amber-700" },
  partial: { label: "Partly paid", className: "bg-sky-50 text-sky-700" },
  paid: { label: "Paid", className: "bg-emerald-50 text-emerald-700" },
  overdue: { label: "Overdue", className: "bg-rose-50 text-rose-700" },
  cancelled: { label: "Cancelled", className: "bg-slate-100 text-slate-500" },
};
