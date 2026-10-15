import type { Metadata, Viewport } from "next";
import "./globals.css";
import { FinanceProvider } from "@/lib/FinanceContext";
import { AppLayout } from "@/components/layout/AppLayout";

export const metadata: Metadata = {
  title: "FinanceBro AI",
  description: "Track every Shopee, TikTok, Grab and Atome PayLater plan, see what is due, and check whether you can take on another one.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f2f7" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
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
