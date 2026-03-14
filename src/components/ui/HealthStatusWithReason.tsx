"use client";

import { useEffect, useId, useRef, useState } from "react";

type HealthStatusWithReasonProps = {
  label: string;
  colourClass: string;
  reason: string;
  align?: "left" | "right";
};

export default function HealthStatusWithReason({
  label,
  colourClass,
  reason,
  align = "left",
}: HealthStatusWithReasonProps) {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const tooltipId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [bubbleStyle, setBubbleStyle] = useState<{
    top: number;
    left: number;
    width: number;
  }>({
    top: 0,
    left: 0,
    width: 288,
  });

  useEffect(() => {
    if (!isOpen) return;

    const updatePosition = () => {
      const triggerEl = triggerRef.current;
      const bubbleEl = bubbleRef.current;
      if (!triggerEl || !bubbleEl) return;

      const viewportPadding = 8;
      const offsetFromTrigger = 8;
      const triggerRect = triggerEl.getBoundingClientRect();
      const maxWidth = Math.max(220, window.innerWidth - viewportPadding * 2);
      const preferredWidth = Math.min(288, maxWidth);

      let left = triggerRect.left + triggerRect.width / 2 - preferredWidth / 2;
      left = Math.max(viewportPadding, Math.min(left, window.innerWidth - preferredWidth - viewportPadding));

      const bubbleHeight = bubbleEl.getBoundingClientRect().height;
      let top = triggerRect.bottom + offsetFromTrigger;
      const wouldOverflowBottom = top + bubbleHeight + viewportPadding > window.innerHeight;
      if (wouldOverflowBottom) {
        top = triggerRect.top - bubbleHeight - offsetFromTrigger;
      }
      top = Math.max(
        viewportPadding,
        Math.min(top, window.innerHeight - bubbleHeight - viewportPadding)
      );

      setBubbleStyle({
        top,
        left,
        width: preferredWidth,
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isOpen]);

  return (
    <div className={`group relative inline-block ${align === "right" ? "text-right" : "text-left"}`}>
      <div className="inline-flex items-center gap-1">
        <span className={`text-sm font-medium ${colourClass}`}>{label}</span>
        <span
          ref={triggerRef}
          className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-zinc-300 text-[10px] font-semibold text-zinc-500"
          aria-label="Health detail available"
          tabIndex={0}
          role="button"
          aria-describedby={isOpen ? tooltipId : undefined}
          onMouseEnter={() => setIsOpen(true)}
          onMouseLeave={() => setIsOpen(false)}
          onFocus={() => setIsOpen(true)}
          onBlur={() => setIsOpen(false)}
        >
          i
        </span>
      </div>

      <div
        ref={bubbleRef}
        id={tooltipId}
        role="tooltip"
        className={`pointer-events-none fixed z-50 rounded-lg border border-zinc-200/70 bg-white/95 p-3 text-left text-xs text-zinc-700 shadow-lg backdrop-blur-sm ${isOpen ? "block" : "hidden"}`}
        style={bubbleStyle}
      >
        {reason}
      </div>
    </div>
  );
}
