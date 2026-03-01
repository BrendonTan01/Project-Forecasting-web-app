"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createProposal, updateProposal, type ProposalFormData } from "./actions";
import { Button, Card, Input, Select, Textarea } from "@/components/ui/primitives";
import {
  DEFAULT_PROPOSAL_OPTIMIZATION_MODE,
  PROPOSAL_OPTIMIZATION_MODE_DESCRIPTIONS,
  PROPOSAL_OPTIMIZATION_MODE_LABELS,
  PROPOSAL_OPTIMIZATION_MODES,
  normalizeProposalOptimizationMode,
} from "./optimization-modes";

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
    optimization_mode?: string | null;
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

function getLinkedHoursWeeks(startDate: string, endDate: string): number {
  if (!startDate || !endDate) {
    // Assume one full work week (5 working days) when timeline is incomplete.
    return 1;
  }

  const projectWeeks = countProjectWeeks(startDate, endDate);
  return projectWeeks > 0 ? projectWeeks : 0;
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
  const initialOfficeScope = proposal?.office_scope ?? [];
  const [selectedOffices, setSelectedOffices] = useState<Set<string>>(() => new Set(initialOfficeScope));
  const [limitToSelectedOffices, setLimitToSelectedOffices] = useState(initialOfficeScope.length > 0);
  const [optimizationMode, setOptimizationMode] = useState(
    normalizeProposalOptimizationMode(proposal?.optimization_mode ?? DEFAULT_PROPOSAL_OPTIMIZATION_MODE)
  );

  function syncLinkedHours(
    nextStartDate: string,
    nextEndDate: string,
    nextTotalHours: string,
    nextHoursPerWeek: string,
    source: "total" | "per_week"
  ) {
    const weeks = getLinkedHoursWeeks(nextStartDate, nextEndDate);
    if (weeks <= 0) return { total: nextTotalHours, perWeek: nextHoursPerWeek };

    if (source === "total") {
      const total = parseOptionalNumber(nextTotalHours);
      if (total === undefined) return { total: nextTotalHours, perWeek: nextHoursPerWeek };
      return {
        total: nextTotalHours,
        perWeek: formatForInput(total / weeks),
      };
    }

    const perWeek = parseOptionalNumber(nextHoursPerWeek);
    if (perWeek === undefined) return { total: nextTotalHours, perWeek: nextHoursPerWeek };
    return {
      total: formatForInput(perWeek * weeks),
      perWeek: nextHoursPerWeek,
    };
  }

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
      office_scope: limitToSelectedOffices ? Array.from(selectedOffices) : null,
      optimization_mode: optimizationMode,
      status: ((formData.get("status") as string) || "draft") as ProposalFormData["status"],
      notes: (formData.get("notes") as string)?.trim() || undefined,
    };

    if (!data.name) {
      setError("Proposal name is required");
      setSubmitting(false);
      return;
    }

    if (limitToSelectedOffices && selectedOffices.size === 0) {
      setError("Choose at least one office, or switch office scope to all offices.");
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

  const inputClass = "app-input";

  const weeks = startDate && endDate ? countProjectWeeks(startDate, endDate) : null;
  const timelineComplete = Boolean(startDate && endDate);
  const optimizationModesTooltip = PROPOSAL_OPTIMIZATION_MODES.map(
    (mode) => `${PROPOSAL_OPTIMIZATION_MODE_LABELS[mode]}: ${PROPOSAL_OPTIMIZATION_MODE_DESCRIPTIONS[mode]}`
  ).join("\n");
  const officeScopeHint =
    optimizationMode === "single_office_preferred"
      ? "Single office preferred will concentrate work in one office within this scope."
      : optimizationMode === "multi_office_balanced"
        ? "Multi-office balanced will spread work across offices within this scope."
        : "Office scope limits which offices are considered before optimization is applied.";

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4"
    >
      <Card className="space-y-4 p-6">
      {error && (
        <p className="app-alert app-alert-error">
          {error}
        </p>
      )}

      {/* Basic info */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="name" className="mb-1 block text-sm font-medium text-zinc-700">
            Proposal name *
          </label>
          <Input
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
          <Input
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
          <Input
            id="proposed_start_date"
            name="proposed_start_date"
            type="date"
            value={startDate}
            onChange={(e) => {
              const nextStart = e.target.value;
              const nextLinked = syncLinkedHours(
                nextStart,
                endDate,
                totalHours,
                hoursPerWeek,
                lastEditedHoursField === "total" ? "total" : "per_week"
              );
              setStartDate(nextStart);
              setTotalHours(nextLinked.total);
              setHoursPerWeek(nextLinked.perWeek);
            }}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="proposed_end_date" className="mb-1 block text-sm font-medium text-zinc-700">
            Proposed end
          </label>
          <Input
            id="proposed_end_date"
            name="proposed_end_date"
            type="date"
            value={endDate}
            onChange={(e) => {
              const nextEnd = e.target.value;
              const nextLinked = syncLinkedHours(
                startDate,
                nextEnd,
                totalHours,
                hoursPerWeek,
                lastEditedHoursField === "total" ? "total" : "per_week"
              );
              setEndDate(nextEnd);
              setTotalHours(nextLinked.total);
              setHoursPerWeek(nextLinked.perWeek);
            }}
            className={inputClass}
          />
        </div>
      </div>

      {/* Labour hours */}
      <div className="app-card-soft p-4">
        <h2 className="mb-3 font-medium text-zinc-900">Labour estimate</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="estimated_hours" className="mb-1 block text-sm font-medium text-zinc-700">
              Total project hours
            </label>
            <Input
              id="estimated_hours"
              type="number"
              min="0"
              step="0.5"
              value={totalHours}
              onChange={(e) => {
                const nextTotal = e.target.value;
                const nextLinked = syncLinkedHours(
                  startDate,
                  endDate,
                  nextTotal,
                  hoursPerWeek,
                  "total"
                );
                setLastEditedHoursField("total");
                setTotalHours(nextLinked.total);
                setHoursPerWeek(nextLinked.perWeek);
              }}
              className={inputClass}
              placeholder="e.g. 1200"
            />
          </div>
          <div>
            <label htmlFor="hours_per_week" className="mb-1 block text-sm font-medium text-zinc-700">
              Hours per week (team total)
            </label>
            <Input
              id="hours_per_week"
              type="number"
              min="0"
              step="0.5"
              value={hoursPerWeek}
              onChange={(e) => {
                const nextPerWeek = e.target.value;
                const nextLinked = syncLinkedHours(
                  startDate,
                  endDate,
                  totalHours,
                  nextPerWeek,
                  "per_week"
                );
                setLastEditedHoursField("per_week");
                setTotalHours(nextLinked.total);
                setHoursPerWeek(nextLinked.perWeek);
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

      {/* Allocation objective */}
      <div className="app-card-soft p-4">
        <div className="mb-1 flex items-center gap-2">
          <h2 className="font-medium text-zinc-900">Allocation objective</h2>
          <span
            className="inline-flex h-5 w-5 cursor-help items-center justify-center rounded-full border border-zinc-300 text-xs text-zinc-500"
            title={optimizationModesTooltip}
            aria-label="Show allocation objective descriptions"
          >
            ?
          </span>
        </div>
        <p className="mb-3 text-xs text-zinc-500">
          Choose what the feasibility engine should optimize for.
        </p>
        <Select
          id="optimization_mode"
          name="optimization_mode"
          value={optimizationMode}
          onChange={(e) => setOptimizationMode(normalizeProposalOptimizationMode(e.target.value))}
        >
          {PROPOSAL_OPTIMIZATION_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {PROPOSAL_OPTIMIZATION_MODE_LABELS[mode]}
            </option>
          ))}
        </Select>
        <p className="mt-2 text-xs text-zinc-500">
          {PROPOSAL_OPTIMIZATION_MODE_DESCRIPTIONS[optimizationMode]}
        </p>
      </div>

      {/* Office scope */}
      {offices.length > 0 && (
        <div className="app-card-soft p-4">
          <h2 className="mb-1 font-medium text-zinc-900">Office scope</h2>
          <p className="mb-3 text-xs text-zinc-500">
            Set where staffing can be sourced from.
          </p>
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={limitToSelectedOffices}
              onClick={() =>
                setLimitToSelectedOffices((prev) => {
                  const next = !prev;
                  if (next && selectedOffices.size === 0 && offices.length > 0) {
                    setSelectedOffices(new Set([offices[0].id]));
                  }
                  return next;
                })
              }
              className="app-toggle focus-ring"
              data-on={limitToSelectedOffices}
            >
              <span className="app-toggle-thumb" />
            </button>
            <span className="text-sm text-zinc-700">
              {limitToSelectedOffices ? "Selected offices only" : "All offices"}
            </span>
          </div>
          {limitToSelectedOffices ? (
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
          ) : (
            <p className="text-xs text-zinc-400">Every office is in scope for feasibility analysis.</p>
          )}
          <p className="mt-2 text-xs text-zinc-500">{officeScopeHint}</p>
        </div>
      )}

      {/* Status and notes */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="status" className="mb-1 block text-sm font-medium text-zinc-700">
            Status
          </label>
          <Select
            id="status"
            name="status"
            defaultValue={proposal?.status ?? "draft"}
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
          </Select>
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
        <Textarea
          id="notes"
          name="notes"
          rows={3}
          defaultValue={proposal?.notes ?? ""}
          placeholder="Optional assumptions, dependencies, or scope notes"
        />
      </div>

      <div className="flex gap-3 pt-2">
        <Button
          type="submit"
          disabled={submitting}
        >
          {submitting ? "Saving…" : isEdit ? "Save changes" : "Create proposal"}
        </Button>
        <Link
          href={isEdit ? `/proposals/${proposal.id}` : "/proposals"}
          className="app-btn app-btn-secondary focus-ring px-4 py-2 text-sm"
        >
          Cancel
        </Link>
      </div>
      </Card>
    </form>
  );
}
