"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createProposal, updateProposal, type ProposalFormData } from "./actions";

type ProposalFormProps = {
  proposal?: {
    id: string;
    name: string;
    client_name?: string | null;
    proposed_start_date?: string | null;
    proposed_end_date?: string | null;
    estimated_hours?: number | null;
    expected_revenue?: number | null;
    manual_estimated_cost?: number | null;
    derived_estimated_cost_override?: number | null;
    risk_allowance_amount?: number | null;
    win_probability_percent?: number | null;
    schedule_confidence_percent?: number | null;
    cross_office_dependency_percent?: number | null;
    client_quality_score?: number | null;
    cost_source_preference: "manual_first" | "derived_first";
    status: "draft" | "submitted" | "won" | "lost";
    notes?: string | null;
  };
};

function parseOptionalNumber(formData: FormData, field: string): number | undefined {
  const value = formData.get(field);
  if (!value || typeof value !== "string" || !value.trim()) return undefined;
  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

export function ProposalForm({ proposal }: ProposalFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const isEdit = !!proposal;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const form = e.currentTarget;
    const formData = new FormData(form);

    const data: ProposalFormData = {
      name: (formData.get("name") as string)?.trim() ?? "",
      client_name: (formData.get("client_name") as string)?.trim() || undefined,
      proposed_start_date: (formData.get("proposed_start_date") as string) || undefined,
      proposed_end_date: (formData.get("proposed_end_date") as string) || undefined,
      estimated_hours: parseOptionalNumber(formData, "estimated_hours"),
      expected_revenue: parseOptionalNumber(formData, "expected_revenue"),
      manual_estimated_cost: parseOptionalNumber(formData, "manual_estimated_cost"),
      derived_estimated_cost_override: parseOptionalNumber(formData, "derived_estimated_cost_override"),
      risk_allowance_amount: parseOptionalNumber(formData, "risk_allowance_amount"),
      win_probability_percent: parseOptionalNumber(formData, "win_probability_percent"),
      schedule_confidence_percent: parseOptionalNumber(formData, "schedule_confidence_percent"),
      cross_office_dependency_percent: parseOptionalNumber(formData, "cross_office_dependency_percent"),
      client_quality_score: parseOptionalNumber(formData, "client_quality_score"),
      cost_source_preference:
        ((formData.get("cost_source_preference") as string) || "manual_first") as ProposalFormData["cost_source_preference"],
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
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
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
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
            placeholder="e.g. State Infrastructure Agency"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <label htmlFor="proposed_start_date" className="mb-1 block text-sm font-medium text-zinc-700">
            Proposed start
          </label>
          <input
            id="proposed_start_date"
            name="proposed_start_date"
            type="date"
            defaultValue={proposal?.proposed_start_date ?? ""}
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
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
            defaultValue={proposal?.proposed_end_date ?? ""}
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
          />
        </div>
        <div>
          <label htmlFor="estimated_hours" className="mb-1 block text-sm font-medium text-zinc-700">
            Estimated hours
          </label>
          <input
            id="estimated_hours"
            name="estimated_hours"
            type="number"
            min="0"
            step="0.5"
            defaultValue={proposal?.estimated_hours ?? ""}
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
            placeholder="e.g. 1200"
          />
        </div>
      </div>

      <div className="rounded-md border border-zinc-200 p-4">
        <h2 className="mb-3 font-medium text-zinc-900">Financial inputs</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label htmlFor="expected_revenue" className="mb-1 block text-sm font-medium text-zinc-700">
              Expected revenue
            </label>
            <input
              id="expected_revenue"
              name="expected_revenue"
              type="number"
              min="0"
              step="0.01"
              defaultValue={proposal?.expected_revenue ?? ""}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
              placeholder="e.g. 850000"
            />
          </div>
          <div>
            <label htmlFor="manual_estimated_cost" className="mb-1 block text-sm font-medium text-zinc-700">
              Manual estimated cost
            </label>
            <input
              id="manual_estimated_cost"
              name="manual_estimated_cost"
              type="number"
              min="0"
              step="0.01"
              defaultValue={proposal?.manual_estimated_cost ?? ""}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
              placeholder="e.g. 600000"
            />
          </div>
          <div>
            <label htmlFor="derived_estimated_cost_override" className="mb-1 block text-sm font-medium text-zinc-700">
              Derived cost override
            </label>
            <input
              id="derived_estimated_cost_override"
              name="derived_estimated_cost_override"
              type="number"
              min="0"
              step="0.01"
              defaultValue={proposal?.derived_estimated_cost_override ?? ""}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
              placeholder="Optional fallback override"
            />
          </div>
          <div>
            <label htmlFor="risk_allowance_amount" className="mb-1 block text-sm font-medium text-zinc-700">
              Risk allowance amount
            </label>
            <input
              id="risk_allowance_amount"
              name="risk_allowance_amount"
              type="number"
              min="0"
              step="0.01"
              defaultValue={proposal?.risk_allowance_amount ?? ""}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
            />
          </div>
          <div>
            <label htmlFor="cost_source_preference" className="mb-1 block text-sm font-medium text-zinc-700">
              Cost source preference
            </label>
            <select
              id="cost_source_preference"
              name="cost_source_preference"
              defaultValue={proposal?.cost_source_preference ?? "manual_first"}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
            >
              <option value="manual_first">Manual first</option>
              <option value="derived_first">Derived first</option>
            </select>
          </div>
          <div>
            <label htmlFor="status" className="mb-1 block text-sm font-medium text-zinc-700">
              Status
            </label>
            <select
              id="status"
              name="status"
              defaultValue={proposal?.status ?? "draft"}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
            >
              <option value="draft">Draft</option>
              <option value="submitted">Submitted</option>
              <option value="won">Won</option>
              <option value="lost">Lost</option>
            </select>
          </div>
        </div>
      </div>

      <div className="rounded-md border border-zinc-200 p-4">
        <h2 className="mb-3 font-medium text-zinc-900">Delivery and bid risk inputs</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="win_probability_percent" className="mb-1 block text-sm font-medium text-zinc-700">
              Win probability (%)
            </label>
            <input
              id="win_probability_percent"
              name="win_probability_percent"
              type="number"
              min="0"
              max="100"
              step="0.1"
              defaultValue={proposal?.win_probability_percent ?? ""}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
            />
          </div>
          <div>
            <label htmlFor="schedule_confidence_percent" className="mb-1 block text-sm font-medium text-zinc-700">
              Schedule confidence (%)
            </label>
            <input
              id="schedule_confidence_percent"
              name="schedule_confidence_percent"
              type="number"
              min="0"
              max="100"
              step="0.1"
              defaultValue={proposal?.schedule_confidence_percent ?? ""}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
            />
          </div>
          <div>
            <label htmlFor="cross_office_dependency_percent" className="mb-1 block text-sm font-medium text-zinc-700">
              Cross-office dependency (%)
            </label>
            <input
              id="cross_office_dependency_percent"
              name="cross_office_dependency_percent"
              type="number"
              min="0"
              max="100"
              step="0.1"
              defaultValue={proposal?.cross_office_dependency_percent ?? ""}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
            />
          </div>
          <div>
            <label htmlFor="client_quality_score" className="mb-1 block text-sm font-medium text-zinc-700">
              Client quality score (0-100)
            </label>
            <input
              id="client_quality_score"
              name="client_quality_score"
              type="number"
              min="0"
              max="100"
              step="0.1"
              defaultValue={proposal?.client_quality_score ?? ""}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
            />
          </div>
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
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
          placeholder="Optional assumptions, dependencies, or risk notes"
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
