"use client";

interface SegmentedProps<T extends string> {
  options: readonly { value: T; label: React.ReactNode }[];
  value: T;
  onChange: (value: T) => void;
  size?: "sm" | "md";
  className?: string;
  "aria-label"?: string;
}

// iOS-style segmented control. The thumb is one element that slides between
// segments, so a quick second tap re-targets it mid-flight from where it is.
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = "md",
  className = "",
  ...rest
}: SegmentedProps<T>) {
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const n = options.length;

  return (
    <div
      role="radiogroup"
      aria-label={rest["aria-label"]}
      className={`relative grid rounded-[0.6rem] bg-gray/12 p-0.5 ${className}`}
      style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}
    >
      <span
        aria-hidden
        className="absolute bottom-0.5 left-0.5 top-0.5 rounded-[0.5rem] bg-surface shadow-[0_3px_8px_rgba(0,0,0,0.12),0_3px_1px_rgba(0,0,0,0.04)] transition-transform duration-500 ease-spring dark:bg-[rgb(99_99_102)]"
        style={{
          width: `calc((100% - 0.25rem) / ${n})`,
          transform: `translateX(${index * 100}%)`,
        }}
      />
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onPointerDown={() => onChange(o.value)}
            onClick={() => onChange(o.value)}
            className={`relative z-10 whitespace-nowrap rounded-[0.5rem] px-3 font-medium transition-[color,font-weight] duration-200 ${
              size === "sm" ? "h-7 text-footnote" : "h-8 text-subhead"
            } ${active ? "font-semibold text-label" : "text-label-2"}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
