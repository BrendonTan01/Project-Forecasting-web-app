"use client";

import { useRouter, useSearchParams } from "next/navigation";

const statuses = [
  { value: "", label: "All" },
  { value: "active", label: "Active" },
  { value: "on_hold", label: "On hold" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
] as const;

export default function ProjectStatusFilter() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const current = searchParams.get("status") ?? "";

  function handleClick(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set("status", value);
    } else {
      params.delete("status");
    }
    router.push(`/projects?${params.toString()}`);
  }

  return (
    <div className="app-toolbar flex gap-1 rounded-xl p-1">
      {statuses.map((s) => (
        <button
          key={s.value}
          onClick={() => handleClick(s.value)}
          className={`focus-ring rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
            current === s.value
              ? "bg-[color:var(--accent)] text-[color:var(--accent-contrast)] shadow-sm"
              : "text-[color:var(--muted-text)] hover:bg-[color:var(--surface-muted)] hover:text-zinc-900"
          }`}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}
