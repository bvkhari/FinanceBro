"use client";

import { InputHTMLAttributes, SelectHTMLAttributes, useId } from "react";
import { ChevronDown } from "lucide-react";

const field =
  "w-full rounded-xl bg-gray/12 px-3.5 text-body text-label placeholder:text-label-3 outline-none transition-[box-shadow,background-color] duration-150 focus:bg-surface focus:shadow-[0_0_0_3px_rgb(var(--accent)/0.35)]";

function Label({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block px-1 text-footnote font-medium text-label-2">
      {children}
    </label>
  );
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function Input({ label, error, className = "", id, ...props }: InputProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <div className="w-full">
      {label && <Label htmlFor={inputId}>{label}</Label>}
      <input
        id={inputId}
        aria-invalid={!!error}
        className={`${field} h-11 ${error ? "shadow-[0_0_0_2px_rgb(var(--negative)/0.6)]" : ""} ${className}`}
        {...props}
      />
      {error && <p className="mt-1.5 px-1 text-footnote text-negative">{error}</p>}
    </div>
  );
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: { value: string; label: string }[];
}

export function Select({ label, options, className = "", id, ...props }: SelectProps) {
  const autoId = useId();
  const selectId = id ?? autoId;
  return (
    <div className="w-full">
      {label && <Label htmlFor={selectId}>{label}</Label>}
      <div className="relative">
        <select id={selectId} className={`${field} h-11 appearance-none pr-9 ${className}`} {...props}>
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-label-3" />
      </div>
    </div>
  );
}

interface TextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
}

export function TextArea({ label, className = "", id, ...props }: TextAreaProps) {
  const autoId = useId();
  const areaId = id ?? autoId;
  return (
    <div className="w-full">
      {label && <Label htmlFor={areaId}>{label}</Label>}
      <textarea id={areaId} className={`${field} resize-none py-2.5 ${className}`} rows={3} {...props} />
    </div>
  );
}
