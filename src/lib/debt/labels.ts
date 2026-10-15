import { BusinessDebtType, DebtFrequency, DebtType, InstalmentStatus, PersonalDebtType } from "../types";

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

/** PayLater providers offered when adding a plan. Any other name can be typed in. */
export const BNPL_PROVIDERS = ["Shopee PayLater", "TikTok PayLater", "Grab PayLater", "Atome"] as const;

export const DEBT_TYPE_LABELS: Record<DebtType, string> = { ...PERSONAL_DEBT_TYPES, ...BUSINESS_DEBT_TYPES };

export const FREQUENCY_LABELS: Record<DebtFrequency, string> = {
  one_time: "One-time",
  weekly: "Weekly",
  biweekly: "Every two weeks",
  monthly: "Monthly",
  yearly: "Yearly",
  irregular: "Irregular (enter each payment)",
};

export const INSTALMENT_STATUS_STYLE: Record<InstalmentStatus, { label: string; className: string }> = {
  upcoming: { label: "Upcoming", className: "bg-warning/12 text-warning" },
  partial: { label: "Partly paid", className: "bg-info/12 text-info" },
  paid: { label: "Paid", className: "bg-positive/12 text-positive" },
  overdue: { label: "Overdue", className: "bg-negative/12 text-negative" },
  cancelled: { label: "Cancelled", className: "bg-gray/12 text-label-2" },
};
