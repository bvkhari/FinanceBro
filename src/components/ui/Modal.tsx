"use client";

import { ModalProps } from "@/lib/types";
import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

// Apple's projection: where a flick would come to rest under scroll deceleration.
function project(velocity: number, decelerationRate = 0.998) {
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate);
}

// Progressive resistance past a boundary instead of a hard stop.
function rubberband(overshoot: number, dimension: number, c = 0.55) {
  return (overshoot * dimension * c) / (dimension + c * Math.abs(overshoot));
}

/**
 * A sheet. On phones it rises from the bottom edge and can be dragged down to
 * dismiss (1:1 tracking, momentum projection, velocity-aware spring back).
 * On larger screens it is a centred card that scales in. It stays mounted
 * while closing so the exit follows the same path as the entrance.
 */
export function Modal({
  isOpen,
  onClose,
  title,
  children,
  size = "md",
}: ModalProps & { children: React.ReactNode; size?: "sm" | "md" | "lg" }) {
  const [mounted, setMounted] = useState(isOpen);
  const [shown, setShown] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y0: number; t: number; samples: { y: number; t: number }[] } | null>(null);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);

  // Mount → next frame show (so the transition runs); hide → unmount after exit.
  useEffect(() => {
    if (isOpen) {
      setMounted(true);
      setDragY(0);
      const id = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
      return () => cancelAnimationFrame(id);
    }
    setShown(false);
    const t = setTimeout(() => setMounted(false), 380);
    return () => clearTimeout(t);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [isOpen, onClose]);

  if (!mounted) return null;

  const sizeClass = { sm: "sm:max-w-md", md: "sm:max-w-lg", lg: "sm:max-w-2xl" }[size];

  const onPointerDown = (e: React.PointerEvent) => {
    if (window.matchMedia("(min-width: 640px)").matches) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { y0: e.clientY - dragY, t: e.timeStamp, samples: [{ y: e.clientY, t: e.timeStamp }] };
    setDragging(true);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const raw = e.clientY - d.y0;
    const h = sheetRef.current?.offsetHeight ?? 600;
    setDragY(raw < 0 ? rubberband(raw, h) : raw);
    d.samples.push({ y: e.clientY, t: e.timeStamp });
    if (d.samples.length > 5) d.samples.shift();
  };
  const onPointerUp = () => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    setDragging(false);
    const first = d.samples[0];
    const last = d.samples[d.samples.length - 1];
    const dt = last.t - first.t;
    const velocity = dt > 0 ? ((last.y - first.y) / dt) * 1000 : 0; // px/s
    const h = sheetRef.current?.offsetHeight ?? 600;
    // Decide from where the gesture is going, not where it was released.
    if (dragY + project(velocity) > h * 0.5 && velocity > -200) {
      onClose();
    } else {
      setDragY(0);
    }
  };

  const open = shown && isOpen;
  const translate = open ? dragY : undefined;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={title}>
      <div
        className="absolute inset-0 transition-opacity duration-300 ease-out"
        style={{ background: "var(--scrim)", opacity: open ? 1 : 0 }}
        onClick={onClose}
      />
      <div
        ref={sheetRef}
        data-motion="slide"
        className={`relative z-10 flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-elevated shadow-float sm:rounded-3xl ${sizeClass} ${
          dragging ? "" : "transition-[transform,opacity] duration-500 ease-spring"
        } ${open ? "" : "translate-y-full opacity-100 sm:translate-y-0 sm:scale-[0.96] sm:opacity-0"}`}
        style={translate !== undefined ? { transform: `translateY(${translate}px)` } : undefined}
      >
        {/* Grabber + header double as the drag handle on phones */}
        <div
          className="touch-none select-none sm:touch-auto"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div className="flex justify-center pt-2 sm:hidden">
            <span className="h-1.5 w-9 rounded-full bg-gray/30" />
          </div>
          <div className="flex items-center justify-between px-5 pb-2 pt-3 sm:pt-5">
            <h2 className="text-title3 text-label">{title}</h2>
            <button
              onClick={onClose}
              onPointerDown={(e) => e.stopPropagation()}
              className="press flex h-8 w-8 items-center justify-center rounded-full bg-gray/12 text-label-2"
              aria-label="Close"
            >
              <X className="h-4 w-4" strokeWidth={2.5} />
            </button>
          </div>
        </div>
        <div className="overflow-y-auto px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-2">{children}</div>
      </div>
    </div>
  );
}
