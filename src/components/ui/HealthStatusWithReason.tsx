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
  return (
    <div className={`group inline-block ${align === "right" ? "text-right" : "text-left"}`}>
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
      <p className="mt-1 hidden max-w-xs text-xs text-zinc-600 group-hover:block group-focus-within:block">
        {reason}
      </p>
    </div>
  );
}
