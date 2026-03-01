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
    <div className="flex gap-1 rounded-lg border border-zinc-200 bg-white p-1">
      {statuses.map((s) => (
        <button
          key={s.value}
          onClick={() => handleClick(s.value)}
          className={`focus-ring rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            current === s.value
              ? "bg-zinc-100 text-zinc-900 shadow-sm"
              : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
          }`}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}
