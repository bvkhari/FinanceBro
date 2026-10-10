import { ReactNode } from "react";

// Large title that scrolls with the content; TopNav fades in the compact one.
export function PageHeader({ title, subtitle, accessory }: { title: string; subtitle?: ReactNode; accessory?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-large-title text-label">{title}</h1>
        {subtitle && <p className="mt-1 text-body text-label-2">{subtitle}</p>}
      </div>
      {accessory && <div className="shrink-0">{accessory}</div>}
    </div>
  );
}
