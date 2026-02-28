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

function parseIsoDate(value: string): Date | null {
  const parts = value.split("-").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
  const [year, month, day] = parts;
  return new Date(Date.UTC(year, month - 1, day));
}

function countWorkingDays(startDate: string, endDate: string): number {
  const start = parseIsoDate(startDate);
  const end = parseIsoDate(endDate);
  if (!start || !end || end < start) return 0;

  let count = 0;
  const cursor = new Date(start);
  while (cursor <= end) {
    const day = cursor.getUTCDay();
    if (day >= 1 && day <= 5) count += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}

function countProjectWeeks(startDate: string, endDate: string): number {
  return countWorkingDays(startDate, endDate) / 5;
}

function roundToSingleDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

function formatForInput(value: number): string {
  return `${roundToSingleDecimal(value)}`;
}

function fmtHours(h: number): string {
  return `${Math.round(h * 10) / 10}h`;
}

export function ProposalForm({ offices, proposal }: ProposalFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const isEdit = !!proposal;

  const [totalHours, setTotalHours] = useState(proposal?.estimated_hours?.toString() ?? "");
  const [hoursPerWeek, setHoursPerWeek] = useState(proposal?.estimated_hours_per_week?.toString() ?? "");
  const [startDate, setStartDate] = useState(proposal?.proposed_start_date ?? "");
  const [endDate, setEndDate] = useState(proposal?.proposed_end_date ?? "");
  const [lastEditedHoursField, setLastEditedHoursField] = useState<"total" | "per_week">(() => {
    if (proposal?.estimated_hours_per_week && !proposal?.estimated_hours) return "per_week";
    return "total";
  });
  const [selectedOffices, setSelectedOffices] = useState<Set<string>>(
    new Set(proposal?.office_scope ?? [])
  );

  useEffect(() => {
    const weeks = startDate && endDate ? countProjectWeeks(startDate, endDate) : 0;
    if (weeks <= 0) return;

    if (lastEditedHoursField === "total") {
      const total = parseOptionalNumber(totalHours);
      if (total === undefined) {
        if (hoursPerWeek) setHoursPerWeek("");
        return;
      }
      const nextPerWeek = formatForInput(total / weeks);
      if (nextPerWeek !== hoursPerWeek) {
        setHoursPerWeek(nextPerWeek);
      }
      return;
    }

    const perWeek = parseOptionalNumber(hoursPerWeek);
    if (perWeek === undefined) {
      if (totalHours) setTotalHours("");
      return;
    }
    const nextTotal = formatForInput(perWeek * weeks);
    if (nextTotal !== totalHours) {
      setTotalHours(nextTotal);
    }
  }, [lastEditedHoursField, totalHours, hoursPerWeek, startDate, endDate]);

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

    const finalTotalHours = parseOptionalNumber(totalHours);
    const finalPerWeek = parseOptionalNumber(hoursPerWeek);

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

    if (data.status !== "draft" && (!data.proposed_start_date || !data.proposed_end_date)) {
      setError("Set both timeline dates before changing status from draft");
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

  const weeks = startDate && endDate ? countProjectWeeks(startDate, endDate) : null;
  const timelineComplete = Boolean(startDate && endDate);

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

        <div className="grid gap-4 sm:grid-cols-2">
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
              onChange={(e) => {
                setLastEditedHoursField("total");
                setTotalHours(e.target.value);
              }}
              className={inputClass}
              placeholder="e.g. 1200"
            />
          </div>
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
              onChange={(e) => {
                setLastEditedHoursField("per_week");
                setHoursPerWeek(e.target.value);
              }}
              className={inputClass}
              placeholder="e.g. 80"
            />
          </div>

          {/* Derived summary */}
          <div className="flex flex-col justify-end">
            <div className="rounded-md bg-zinc-50 px-4 py-3 text-sm">
              {weeks !== null && weeks > 0 ? (
                <div className="space-y-1 text-zinc-700">
                  <div className="flex justify-between">
                    <span>Duration (working weeks)</span>
                    <span className="font-medium">{roundToSingleDecimal(weeks)} weeks</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Total hours</span>
                    <span className="font-medium">
                      {parseOptionalNumber(totalHours) !== undefined ? fmtHours(parseOptionalNumber(totalHours)!) : "—"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Hours / week</span>
                    <span className="font-medium">
                      {parseOptionalNumber(hoursPerWeek) !== undefined
                        ? fmtHours(parseOptionalNumber(hoursPerWeek)!)
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
            <option value="submitted" disabled={!timelineComplete}>
              Submitted
            </option>
            <option value="won" disabled={!timelineComplete}>
              Won
            </option>
            <option value="lost" disabled={!timelineComplete}>
              Lost
            </option>
          </select>
          {!timelineComplete && (
            <p className="mt-1 text-xs text-amber-600">
              Set both timeline dates before moving status out of draft.
            </p>
          )}
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
