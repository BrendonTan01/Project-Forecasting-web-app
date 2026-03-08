"use client";

import { useState } from "react";
import { createLeaveRequest } from "./actions";
import { Button, Select } from "@/components/ui/primitives";

export default function LeaveRequestForm() {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [leaveType, setLeaveType] = useState<"annual" | "sick">("annual");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setLoading(true);

    const result = await createLeaveRequest({ startDate, endDate, leaveType });

    setLoading(false);
    if (result.error) {
      setError(result.error);
    } else {
      setSuccess(true);
      setStartDate("");
      setEndDate("");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="startDate" className="mb-1 block text-sm font-medium text-zinc-700">
            Start date
          </label>
          <input
            id="startDate"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            required
            className="app-input w-full"
          />
        </div>
        <div>
          <label htmlFor="endDate" className="mb-1 block text-sm font-medium text-zinc-700">
            End date
          </label>
          <input
            id="endDate"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            required
            min={startDate || undefined}
            className="app-input w-full"
          />
        </div>
      </div>
      <div>
        <label htmlFor="leaveType" className="mb-1 block text-sm font-medium text-zinc-700">
          Leave type
        </label>
        <Select
          id="leaveType"
          value={leaveType}
          onChange={(e) => setLeaveType(e.target.value as "annual" | "sick")}
          required
        >
          <option value="annual">Annual leave</option>
          <option value="sick">Sick leave</option>
        </Select>
      </div>
      {error && <p className="app-alert app-alert-error">{error}</p>}
      {success && (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          Leave request submitted. Awaiting manager approval.
        </p>
      )}
      <Button type="submit" disabled={loading}>
        {loading ? "Submitting..." : "Submit leave request"}
      </Button>
    </form>
  );
}
