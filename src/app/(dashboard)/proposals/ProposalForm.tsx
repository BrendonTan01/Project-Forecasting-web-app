"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createProposal, updateProposal, type ProposalFormData } from "./actions";

type Office = { id: string; name: string };

type ProposalFormProps = {
  offices: Office[];
  proposal?: {
    id: string;
    name: string;
    client_name?: string | null;
    proposed_start_date?: string | null;
    proposed_end_date?: string | null;
    estimated_hours?: number | null;
    estimated_hours_per_week?: number | null;
    office_scope?: string[] | null;
    status: "draft" | "submitted" | "won" | "lost";
    notes?: string | null;
  };
};

function parseOptionalNumber(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function countProjectWeeks(startDate: string, endDate: string): number {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffMs = end.getTime() - start.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return Math.max(diffDays / 7, 0);
}

function fmtHours(h: number): string {
  return `${Math.round(h * 10) / 10}h`;
}

export function ProposalForm({ offices, proposal }: ProposalFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const isEdit = !!proposal;

  // Hours input mode: "total" or "per_week"
  const [hoursMode, setHoursMode] = useState<"total" | "per_week">(() => {
    if (proposal?.estimated_hours_per_week && !proposal?.estimated_hours) return "per_week";
    return "total";
  });

  const [totalHours, setTotalHours] = useState(proposal?.estimated_hours?.toString() ?? "");
  const [hoursPerWeek, setHoursPerWeek] = useState(proposal?.estimated_hours_per_week?.toString() ?? "");
  const [startDate, setStartDate] = useState(proposal?.proposed_start_date ?? "");
  const [endDate, setEndDate] = useState(proposal?.proposed_end_date ?? "");
  const [selectedOffices, setSelectedOffices] = useState<Set<string>>(
    new Set(proposal?.office_scope ?? [])
  );

  // Derived values shown read-only
  const [derivedTotal, setDerivedTotal] = useState<number | null>(null);
  const [derivedPerWeek, setDerivedPerWeek] = useState<number | null>(null);

  useEffect(() => {
    const weeks = startDate && endDate ? countProjectWeeks(startDate, endDate) : null;

    if (hoursMode === "total") {
      const total = parseOptionalNumber(totalHours);
      setDerivedTotal(null);
      if (total !== undefined && weeks && weeks > 0) {
        setDerivedPerWeek(total / weeks);
      } else {
        setDerivedPerWeek(null);
      }
    } else {
      const perWeek = parseOptionalNumber(hoursPerWeek);
      setDerivedPerWeek(null);
      if (perWeek !== undefined && weeks && weeks > 0) {
        setDerivedTotal(perWeek * weeks);
      } else {
        setDerivedTotal(null);
      }
    }
  }, [hoursMode, totalHours, hoursPerWeek, startDate, endDate]);

  function toggleOffice(id: string) {
    setSelectedOffices((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const form = e.currentTarget;
    const formData = new FormData(form);

    const finalTotalHours =
      hoursMode === "total"
        ? parseOptionalNumber(totalHours)
        : derivedTotal !== null
          ? Math.round(derivedTotal * 10) / 10
          : undefined;

    const finalPerWeek =
      hoursMode === "per_week"
        ? parseOptionalNumber(hoursPerWeek)
        : derivedPerWeek !== null
          ? Math.round(derivedPerWeek * 10) / 10
          : undefined;

    const data: ProposalFormData = {
      name: (formData.get("name") as string)?.trim() ?? "",
      client_name: (formData.get("client_name") as string)?.trim() || undefined,
      proposed_start_date: startDate || undefined,
      proposed_end_date: endDate || undefined,
      estimated_hours: finalTotalHours,
      estimated_hours_per_week: finalPerWeek,
      office_scope: selectedOffices.size > 0 ? Array.from(selectedOffices) : null,
      status: ((formData.get("status") as string) || "draft") as ProposalFormData["status"],
      notes: (formData.get("notes") as string)?.trim() || undefined,
    };

    if (!data.name) {
      setError("Proposal name is required");
      setSubmitting(false);
      return;
    }

    if (data.proposed_start_date && data.proposed_end_date && data.proposed_end_date < data.proposed_start_date) {
      setError("Proposed end date cannot be before start date");
      setSubmitting(false);
      return;
    }

    const result = isEdit ? await updateProposal(proposal.id, data) : await createProposal(data);
    if (result.error) {
      setError(result.error);
      setSubmitting(false);
      return;
    }

    if ("id" in result && result.id) {
      router.push(`/proposals/${result.id}`);
    } else if (isEdit) {
      router.push(`/proposals/${proposal.id}`);
    } else {
      router.push("/proposals");
    }
    router.refresh();
  }

  const inputClass =
    "w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500";

  const weeks =
    startDate && endDate ? countProjectWeeks(startDate, endDate) : null;

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-lg border border-zinc-200 bg-white p-6"
    >
      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {/* Basic info */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="name" className="mb-1 block text-sm font-medium text-zinc-700">
            Proposal name *
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            defaultValue={proposal?.name}
            className={inputClass}
            placeholder="e.g. Airport Expansion Bid"
          />
        </div>
        <div>
          <label htmlFor="client_name" className="mb-1 block text-sm font-medium text-zinc-700">
            Client name
          </label>
          <input
            id="client_name"
            name="client_name"
            type="text"
            defaultValue={proposal?.client_name ?? ""}
            className={inputClass}
            placeholder="e.g. State Infrastructure Agency"
          />
        </div>
      </div>

      {/* Dates */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="proposed_start_date" className="mb-1 block text-sm font-medium text-zinc-700">
            Proposed start
          </label>
          <input
            id="proposed_start_date"
            name="proposed_start_date"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="proposed_end_date" className="mb-1 block text-sm font-medium text-zinc-700">
            Proposed end
          </label>
          <input
            id="proposed_end_date"
            name="proposed_end_date"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>

      {/* Labour hours */}
      <div className="rounded-md border border-zinc-200 p-4">
        <h2 className="mb-3 font-medium text-zinc-900">Labour estimate</h2>

        {/* Toggle */}
        <div className="mb-4 inline-flex rounded-md border border-zinc-300 p-0.5 text-sm">
          <button
            type="button"
            onClick={() => setHoursMode("total")}
            className={`rounded px-3 py-1.5 font-medium transition-colors ${
              hoursMode === "total"
                ? "bg-zinc-900 text-white"
                : "text-zinc-600 hover:text-zinc-900"
            }`}
          >
            Total project hours
          </button>
          <button
            type="button"
            onClick={() => setHoursMode("per_week")}
            className={`rounded px-3 py-1.5 font-medium transition-colors ${
              hoursMode === "per_week"
                ? "bg-zinc-900 text-white"
                : "text-zinc-600 hover:text-zinc-900"
            }`}
          >
            Hours per week
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* Primary input */}
          {hoursMode === "total" ? (
            <div>
              <label htmlFor="estimated_hours" className="mb-1 block text-sm font-medium text-zinc-700">
                Total project hours
              </label>
              <input
                id="estimated_hours"
                type="number"
                min="0"
                step="0.5"
                value={totalHours}
                onChange={(e) => setTotalHours(e.target.value)}
                className={inputClass}
                placeholder="e.g. 1200"
              />
            </div>
          ) : (
            <div>
              <label htmlFor="hours_per_week" className="mb-1 block text-sm font-medium text-zinc-700">
                Hours per week (team total)
              </label>
              <input
                id="hours_per_week"
                type="number"
                min="0"
                step="0.5"
                value={hoursPerWeek}
                onChange={(e) => setHoursPerWeek(e.target.value)}
                className={inputClass}
                placeholder="e.g. 80"
              />
            </div>
          )}

          {/* Derived summary */}
          <div className="flex flex-col justify-end">
            <div className="rounded-md bg-zinc-50 px-4 py-3 text-sm">
              {weeks !== null && weeks > 0 ? (
                <div className="space-y-1 text-zinc-700">
                  <div className="flex justify-between">
                    <span>Duration</span>
                    <span className="font-medium">{Math.round(weeks * 10) / 10} weeks</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Total hours</span>
                    <span className="font-medium">
                      {hoursMode === "total"
                        ? parseOptionalNumber(totalHours) !== undefined
                          ? fmtHours(parseOptionalNumber(totalHours)!)
                          : "—"
                        : derivedTotal !== null
                          ? fmtHours(derivedTotal)
                          : "—"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Hours / week</span>
                    <span className="font-medium">
                      {hoursMode === "per_week"
                        ? parseOptionalNumber(hoursPerWeek) !== undefined
                          ? fmtHours(parseOptionalNumber(hoursPerWeek)!)
                          : "—"
                        : derivedPerWeek !== null
                          ? fmtHours(derivedPerWeek)
                          : "—"}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-zinc-400">
                  Set start and end dates to see derived values.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Office scope */}
      {offices.length > 0 && (
        <div className="rounded-md border border-zinc-200 p-4">
          <h2 className="mb-1 font-medium text-zinc-900">Staff scope</h2>
          <p className="mb-3 text-xs text-zinc-500">
            Select which offices to include in feasibility analysis. Leave all unchecked to include all offices.
          </p>
          <div className="flex flex-wrap gap-2">
            {offices.map((office) => {
              const checked = selectedOffices.has(office.id);
              return (
                <button
                  key={office.id}
                  type="button"
                  onClick={() => toggleOffice(office.id)}
                  className={`rounded-full border px-3 py-1 text-sm font-medium transition-colors ${
                    checked
                      ? "border-zinc-900 bg-zinc-900 text-white"
                      : "border-zinc-300 text-zinc-600 hover:border-zinc-500 hover:text-zinc-900"
                  }`}
                >
                  {office.name}
                </button>
              );
            })}
          </div>
          {selectedOffices.size === 0 && (
            <p className="mt-2 text-xs text-zinc-400">All offices will be included.</p>
          )}
        </div>
      )}

      {/* Status and notes */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="status" className="mb-1 block text-sm font-medium text-zinc-700">
            Status
          </label>
          <select
            id="status"
            name="status"
            defaultValue={proposal?.status ?? "draft"}
            className={inputClass}
          >
            <option value="draft">Draft</option>
            <option value="submitted">Submitted</option>
            <option value="won">Won</option>
            <option value="lost">Lost</option>
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="notes" className="mb-1 block text-sm font-medium text-zinc-700">
          Notes
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          defaultValue={proposal?.notes ?? ""}
          className={inputClass}
          placeholder="Optional assumptions, dependencies, or scope notes"
        />
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
        >
          {submitting ? "Saving…" : isEdit ? "Save changes" : "Create proposal"}
        </button>
        <Link
          href={isEdit ? `/proposals/${proposal.id}` : "/proposals"}
          className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
