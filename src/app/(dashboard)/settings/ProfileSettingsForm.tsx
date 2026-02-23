"use client";

import { useState } from "react";
import { updateProfileSettings } from "./actions";

interface Office {
  id: string;
  name: string;
  country: string;
}

interface ProfileSettingsFormProps {
  initialData: {
    job_title: string;
    office_id: string;
    weekly_capacity_hours: number;
    billable_rate: string;
    cost_rate: string;
  };
  role: string;
  offices: Office[];
}

export function ProfileSettingsForm({
  initialData,
  role,
  offices,
}: ProfileSettingsFormProps) {
  const [jobTitle, setJobTitle] = useState(initialData.job_title);
  const [officeId, setOfficeId] = useState(initialData.office_id);
  const [weeklyCapacityHours, setWeeklyCapacityHours] = useState(
    initialData.weekly_capacity_hours.toString()
  );
  const [billableRate, setBillableRate] = useState(initialData.billable_rate);
  const [costRate, setCostRate] = useState(initialData.cost_rate);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const roleLabel =
    role === "exec" ? "Executive" : role === "manager" ? "Manager" : "Staff";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setLoading(true);

    const capacity = parseFloat(weeklyCapacityHours);
    if (isNaN(capacity) || capacity <= 0 || capacity > 168) {
      setError("Weekly capacity must be between 0.5 and 168 hours");
      setLoading(false);
      return;
    }

    const result = await updateProfileSettings({
      job_title: jobTitle.trim() || null,
      office_id: officeId || null,
      weekly_capacity_hours: capacity,
      billable_rate: billableRate ? parseFloat(billableRate) : null,
      cost_rate: costRate ? parseFloat(costRate) : null,
    });

    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setSuccess(true);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="rounded-lg border border-zinc-200 bg-white p-6">
        <h2 className="mb-4 font-medium text-zinc-900">Account</h2>
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700">
            Role
          </label>
          <div className="flex h-10 items-center rounded-md border border-zinc-200 bg-zinc-50 px-3 text-sm text-zinc-600">
            {roleLabel}
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            Your role is set by your administrator and cannot be changed.
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-6">
        <h2 className="mb-4 font-medium text-zinc-900">Profile</h2>
        <div className="space-y-4">
          <div>
            <label
              htmlFor="jobTitle"
              className="mb-1 block text-sm font-medium text-zinc-700"
            >
              Job title
            </label>
            <input
              id="jobTitle"
              type="text"
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              placeholder="e.g. Senior Engineer"
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
            />
          </div>
          <div>
            <label
              htmlFor="office"
              className="mb-1 block text-sm font-medium text-zinc-700"
            >
              Office
            </label>
            <select
              id="office"
              value={officeId}
              onChange={(e) => setOfficeId(e.target.value)}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-zinc-900 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
            >
              <option value="">Select office (optional)</option>
              {offices.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name} ({o.country})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="weeklyCapacity"
              className="mb-1 block text-sm font-medium text-zinc-700"
            >
              Weekly capacity (hours)
            </label>
            <input
              id="weeklyCapacity"
              type="number"
              min="0.5"
              max="168"
              step="0.5"
              value={weeklyCapacityHours}
              onChange={(e) => setWeeklyCapacityHours(e.target.value)}
              required
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-zinc-900 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="billableRate"
                className="mb-1 block text-sm font-medium text-zinc-700"
              >
                Billable rate
              </label>
              <input
                id="billableRate"
                type="number"
                min="0"
                step="0.01"
                value={billableRate}
                onChange={(e) => setBillableRate(e.target.value)}
                placeholder="Optional"
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
              />
            </div>
            <div>
              <label
                htmlFor="costRate"
                className="mb-1 block text-sm font-medium text-zinc-700"
              >
                Cost rate
              </label>
              <input
                id="costRate"
                type="number"
                min="0"
                step="0.01"
                value={costRate}
                onChange={(e) => setCostRate(e.target.value)}
                placeholder="Optional"
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
              />
            </div>
          </div>
        </div>
      </div>

      {error && (
        <p className="rounded-md bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {success && (
        <p className="rounded-md bg-green-50 px-4 py-2 text-sm text-green-700">
          Profile updated successfully.
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="rounded-md bg-zinc-900 px-4 py-2 font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
      >
        {loading ? "Saving..." : "Save changes"}
      </button>
    </form>
  );
}
