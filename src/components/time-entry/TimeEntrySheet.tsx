"use client";

import { useState } from "react";
import Link from "next/link";
import { createTimeEntry, deleteTimeEntry } from "@/app/(dashboard)/time-entry/actions";

interface TimeEntry {
  id: string;
  project_id: string;
  date: string;
  hours: number;
  billable_flag: boolean;
  projects: { id: string; name: string } | null;
}

interface Project {
  id: string;
  name: string;
}

interface TimeEntrySheetProps {
  dates: string[];
  timeEntries: TimeEntry[];
  projects: Project[];
  weekStart: string;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export function TimeEntrySheet({
  dates,
  timeEntries,
  projects,
  weekStart,
}: TimeEntrySheetProps) {
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const prevWeek = new Date(weekStart);
  prevWeek.setDate(prevWeek.getDate() - 7);
  const nextWeek = new Date(weekStart);
  nextWeek.setDate(nextWeek.getDate() + 7);

  const entriesByDate = timeEntries.reduce<Record<string, TimeEntry[]>>((acc, e) => {
    if (!acc[e.date]) acc[e.date] = [];
    acc[e.date].push(e);
    return acc;
  }, {});

  const totalByDate = dates.reduce<Record<string, number>>((acc, d) => {
    acc[d] = (entriesByDate[d] ?? []).reduce((sum, e) => sum + e.hours, 0);
    return acc;
  }, {});

  async function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = e.currentTarget;
    const formData = new FormData(form);
    const result = await createTimeEntry({
      project_id: formData.get("project_id") as string,
      date: formData.get("date") as string,
      hours: parseFloat(formData.get("hours") as string) || 0,
      billable_flag: formData.get("billable_flag") === "on",
    });
    if (result.error) {
      setError(result.error);
      return;
    }
    form.reset();
    setAdding(false);
  }

  async function handleDelete(id: string) {
    setError(null);
    const result = await deleteTimeEntry(id);
    if (result.error) setError(result.error);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <Link
            href={`/time-entry?week=${prevWeek.toISOString().split("T")[0]}`}
            className="rounded border border-zinc-300 px-3 py-1 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
          >
            Previous week
          </Link>
          <Link
            href={`/time-entry?week=${nextWeek.toISOString().split("T")[0]}`}
            className="rounded border border-zinc-300 px-3 py-1 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
          >
            Next week
          </Link>
        </div>
      </div>

      {error && (
        <p className="rounded bg-red-50 p-2 text-sm text-red-700">{error}</p>
      )}

      <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
        <table className="min-w-full">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50">
              <th className="px-4 py-3 text-left text-sm font-semibold text-zinc-800">
                Project
              </th>
              {dates.map((d) => (
                <th
                  key={d}
                  className="min-w-[120px] px-4 py-3 text-center text-sm font-semibold text-zinc-800"
                >
                  {formatDate(d)}
                  {totalByDate[d] > 12 && (
                    <span className="ml-1 text-amber-600" title="Over 12h - please verify">
                      (!)
                    </span>
                  )}
                </th>
              ))}
              <th className="w-16 px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {timeEntries.length === 0 && !adding && (
              <tr>
                <td colSpan={dates.length + 2} className="px-4 py-8 text-center text-sm text-zinc-600">
                  No time entries this week. Click &quot;Add time entry&quot; to log time.
                </td>
              </tr>
            )}
            {timeEntries.map((entry) => (
              <tr key={entry.id} className="border-b border-zinc-100">
                <td className="px-4 py-2 text-sm font-medium text-zinc-900">
                  {entry.projects?.name ?? "Unknown"}
                </td>
                {dates.map((d) => (
                  <td key={d} className="px-4 py-2 text-center text-zinc-800">
                    {entry.date === d ? (
                      <span className="inline-flex items-center gap-1 font-medium">
                        {entry.hours}h
                        {entry.billable_flag && (
                          <span className="text-xs text-zinc-600">(B)</span>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDelete(entry.id)}
                          className="text-red-600 hover:text-red-800"
                          title="Delete"
                        >
                          ×
                        </button>
                      </span>
                    ) : (
                      "-"
                    )}
                  </td>
                ))}
                <td></td>
              </tr>
            ))}
            {adding && (
              <tr className="border-b border-zinc-100 bg-zinc-50">
                <td colSpan={dates.length + 2} className="px-4 py-3">
                  <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-4">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-zinc-600">
                        Project
                      </label>
                      <select
                        name="project_id"
                        required
                        className="rounded border border-zinc-300 px-2 py-1 text-sm text-zinc-900"
                      >
                        <option value="">Select project</option>
                        {projects.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-zinc-600">
                        Date
                      </label>
                      <select name="date" required className="rounded border border-zinc-300 px-2 py-1 text-sm text-zinc-900">
                        {dates.map((d) => (
                          <option key={d} value={d}>
                            {formatDate(d)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-zinc-600">
                        Hours
                      </label>
                      <input
                        type="number"
                        name="hours"
                        step="0.25"
                        min="0.25"
                        max="24"
                        required
                        className="w-20 rounded border border-zinc-300 px-2 py-1 text-sm text-zinc-900"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        name="billable_flag"
                        id="billable"
                        defaultChecked
                        className="rounded"
                      />
                      <label htmlFor="billable" className="text-sm text-zinc-700">
                        Billable
                      </label>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="submit"
                        className="rounded bg-zinc-900 px-3 py-1 text-sm text-white hover:bg-zinc-800"
                      >
                        Add
                      </button>
                      <button
                        type="button"
                        onClick={() => setAdding(false)}
                        className="rounded border border-zinc-300 px-3 py-1 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {!adding && (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="rounded border border-dashed border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:border-zinc-400 hover:bg-zinc-50"
        >
          + Add time entry
        </button>
      )}
    </div>
  );
}
