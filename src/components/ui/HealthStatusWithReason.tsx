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
  const bubblePositionClass = align === "right" ? "right-0" : "left-0";
  const arrowPositionClass = align === "right" ? "right-4" : "left-4";

  return (
    <div className={`group relative inline-block ${align === "right" ? "text-right" : "text-left"}`}>
      <div className="inline-flex items-center gap-1">
        <span className={`text-sm font-medium ${colourClass}`}>{label}</span>
        <span
          className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-zinc-300 text-[10px] font-semibold text-zinc-500"
          aria-label="Health detail available"
          tabIndex={0}
        >
          i
        </span>
      </div>

      <div
        className={`pointer-events-none absolute top-full z-30 mt-2 hidden w-72 ${bubblePositionClass} group-hover:block group-focus-within:block`}
      >
        <div
          className={`absolute -top-1.5 h-3 w-3 rotate-45 border-l border-t border-zinc-200/70 bg-white/85 backdrop-blur-sm ${arrowPositionClass}`}
        />
        <div className="rounded-lg border border-zinc-200/70 bg-white/85 p-3 text-left text-xs text-zinc-700 shadow-lg backdrop-blur-sm">
          {reason}
        </div>
      </div>
    </div>
  );
}
