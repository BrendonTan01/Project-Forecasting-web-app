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
    <div className="flex items-center justify-between border-b border-[color:color-mix(in_srgb,var(--border)_30%,transparent)] pb-0.5">
      <div className="flex flex-wrap gap-6">
      {statuses.map((s) => (
        <button
          key={s.value}
          onClick={() => handleClick(s.value)}
          className={`focus-ring border-b-2 pb-3 text-sm font-medium transition-colors ${
            current === s.value
              ? "border-[color:var(--accent)] text-[color:var(--accent)]"
              : "border-transparent text-[color:var(--muted-text)] hover:text-zinc-900"
          }`}
        >
          {s.label}
        </button>
      ))}
      </div>
      <div className="flex items-center gap-2 pb-2 text-[color:var(--muted-text)]">
        <span className="rounded-md p-1 hover:bg-[color:var(--surface-muted)]">Filter</span>
        <span className="rounded-md p-1 hover:bg-[color:var(--surface-muted)]">Sort</span>
      </div>
    </div>
  );
}
