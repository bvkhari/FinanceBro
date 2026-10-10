import type { Metadata } from "next";
import "./globals.css";
import { FinanceProvider } from "@/lib/FinanceContext";
import { AppLayout } from "@/components/layout/AppLayout";

export const metadata: Metadata = {
  title: "FinanceBro AI — Your Agentic Financial Copilot",
  description: "Track income, expenses, budgets, and commitments with an AI financial copilot.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <FinanceProvider>
          <AppLayout>{children}</AppLayout>
        </FinanceProvider>
      </body>
    </html>
  );
}
