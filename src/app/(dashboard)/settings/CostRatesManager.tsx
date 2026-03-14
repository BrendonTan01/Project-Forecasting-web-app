"use client";

import { useMemo, useState } from "react";
import { updateManagedStaffCosts } from "./actions";
import { Button, Input } from "@/components/ui/primitives";

type ManagedRateRow = {
  staff_id: string;
  displayName: string;
  role: string;
  office_label: string;
  billable_rate: number | null;
  cost_rate: number | null;
};

type Props = {
  rows: ManagedRateRow[];
};

type DraftRates = Record<string, { billable: string; cost: string }>;

export function CostRatesManager({ rows }: Props) {
  const initialDrafts = useMemo<DraftRates>(
    () =>
      rows.reduce<DraftRates>((acc, row) => {
        acc[row.staff_id] = {
          billable: row.billable_rate?.toString() ?? "",
          cost: row.cost_rate?.toString() ?? "",
        };
        return acc;
      }, {}),
    [rows]
  );

  const [drafts, setDrafts] = useState<DraftRates>(initialDrafts);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function setDraftValue(staffId: string, field: "billable" | "cost", value: string) {
    setDrafts((prev) => ({
      ...prev,
      [staffId]: {
        billable: prev[staffId]?.billable ?? "",
        cost: prev[staffId]?.cost ?? "",
        [field]: value,
      },
    }));
  }

  async function handleSave(staffId: string) {
    setError(null);
    setSuccess(null);
    setSavingId(staffId);
    const draft = drafts[staffId] ?? { billable: "", cost: "" };
    const billable = draft.billable.trim() ? Number.parseFloat(draft.billable) : null;
    const cost = draft.cost.trim() ? Number.parseFloat(draft.cost) : null;
    const result = await updateManagedStaffCosts(staffId, {
      billable_rate: Number.isNaN(billable ?? Number.NaN) ? null : billable,
      cost_rate: Number.isNaN(cost ?? Number.NaN) ? null : cost,
    });
    setSavingId(null);

    if (result.error) {
      setError(result.error);
      return;
    }
    setSuccess("Rates updated.");
  }

  return (
    <div className="app-card p-6">
      <h2 className="mb-1 font-medium text-zinc-900">Cost & billable rates</h2>
      <p className="mb-4 text-sm text-zinc-600">
        Update rates used in proposal and project financial forecasts.
      </p>

      {error && <p className="mb-3 app-alert app-alert-error">{error}</p>}
      {success && <p className="mb-3 app-alert app-alert-success">{success}</p>}

      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-sm font-semibold text-zinc-800">
              <th className="pb-2">Staff</th>
              <th className="pb-2">Role</th>
              <th className="pb-2">Office</th>
              <th className="pb-2">Billable rate</th>
              <th className="pb-2">Cost rate</th>
              <th className="pb-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const draft = drafts[row.staff_id] ?? { billable: "", cost: "" };
              return (
                <tr key={row.staff_id} className="border-b border-zinc-100">
                  <td className="py-2 text-sm text-zinc-900">{row.displayName}</td>
                  <td className="py-2 text-sm capitalize text-zinc-700">{row.role}</td>
                  <td className="py-2 text-sm text-zinc-700">{row.office_label}</td>
                  <td className="py-2 pr-2">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={draft.billable}
                      onChange={(e) => setDraftValue(row.staff_id, "billable", e.target.value)}
                      placeholder="Optional"
                    />
                  </td>
                  <td className="py-2 pr-2">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={draft.cost}
                      onChange={(e) => setDraftValue(row.staff_id, "cost", e.target.value)}
                      placeholder="Optional"
                    />
                  </td>
                  <td className="py-2">
                    <Button
                      type="button"
                      disabled={savingId === row.staff_id}
                      onClick={() => handleSave(row.staff_id)}
                    >
                      {savingId === row.staff_id ? "Saving..." : "Save"}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
