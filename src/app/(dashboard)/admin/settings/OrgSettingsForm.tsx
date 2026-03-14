"use client";

import { useState } from "react";
import { updateOrgSettings } from "./actions";
import { Button, Input } from "@/components/ui/primitives";

const CURRENCIES = ["USD", "GBP", "EUR", "AUD", "SGD", "AED", "CAD", "NZD"];

export default function OrgSettingsForm({
  defaultValues,
}: {
  defaultValues: {
    name: string;
    industry: string | null;
    default_currency: string | null;
    planning_hours_per_person_per_week: number;
  };
}) {
  const [name, setName] = useState(defaultValues.name);
  const [industry, setIndustry] = useState(defaultValues.industry ?? "");
  const [currency, setCurrency] = useState(defaultValues.default_currency ?? "USD");
  const [planningHours, setPlanningHours] = useState(
    String(defaultValues.planning_hours_per_person_per_week ?? 40)
  );
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setLoading(true);

    const parsedPlanningHours = Number(planningHours);
    if (!Number.isFinite(parsedPlanningHours) || parsedPlanningHours <= 0 || parsedPlanningHours > 168) {
      setError("Planning hours per person must be between 0.5 and 168.");
      setLoading(false);
      return;
    }

    const result = await updateOrgSettings({
      name,
      industry: industry || undefined,
      default_currency: currency,
      planning_hours_per_person_per_week: parsedPlanningHours,
    });

    setLoading(false);
    if (result.error) {
      setError(result.error);
    } else {
      setSuccess(true);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="orgName" className="mb-1 block text-sm font-medium text-zinc-700">
          Organisation name
        </label>
        <Input
          id="orgName"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>
      <div>
        <label htmlFor="industry" className="mb-1 block text-sm font-medium text-zinc-700">
          Industry <span className="text-zinc-400">(optional)</span>
        </label>
        <Input
          id="industry"
          value={industry}
          onChange={(e) => setIndustry(e.target.value)}
          placeholder="e.g. Engineering Consulting"
        />
      </div>
      <div>
        <label htmlFor="currency" className="mb-1 block text-sm font-medium text-zinc-700">
          Default currency
        </label>
        <select
          id="currency"
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
          className="app-select w-full"
        >
          {CURRENCIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="planningHours" className="mb-1 block text-sm font-medium text-zinc-700">
          Planning hours per person per week
        </label>
        <Input
          id="planningHours"
          type="number"
          min="0.5"
          max="168"
          step="0.5"
          value={planningHours}
          onChange={(e) => setPlanningHours(e.target.value)}
          required
        />
        <p className="mt-1 text-xs text-zinc-500">
          Used to convert between people and hours/week in hiring and skill planning views.
        </p>
      </div>
      {error && <p className="app-alert app-alert-error">{error}</p>}
      {success && (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          Organisation settings saved.
        </p>
      )}
      <Button type="submit" disabled={loading}>
        {loading ? "Saving..." : "Save settings"}
      </Button>
    </form>
  );
}
