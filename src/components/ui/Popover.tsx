"use client";

import { ReactNode, useEffect, useRef } from "react";

interface PopoverProps {
  open: boolean;
  onClose: () => void;
  trigger: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * Popover that grows out of its trigger (transform-origin top-right) and
 * shrinks back into it on close. Always mounted, so a fast re-open reverses
 * the running transition from its current value instead of restarting.
 */
export function Popover({ open, onClose, trigger, children, className = "" }: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  return (
    <div className="relative" ref={ref}>
      {trigger}
      <div
        aria-hidden={!open}
        data-motion="slide"
        className={`absolute right-0 top-full z-40 mt-2 origin-top-right overflow-hidden rounded-2xl bg-elevated shadow-float transition-[opacity,transform,visibility] max-sm:fixed max-sm:inset-x-3 max-sm:top-[calc(var(--topbar-h)+0.25rem)] max-sm:mt-0 max-sm:w-auto ${
          open
            ? "visible scale-100 opacity-100 duration-500 ease-spring"
            : "pointer-events-none invisible scale-[0.92] opacity-0 duration-200 ease-out"
        } ${className}`}
      >
        {children}
      </div>
    </div>
  );
}
