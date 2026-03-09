"use client";

import { useMemo, useState } from "react";
import { createTimeEntry } from "@/app/(dashboard)/time-entry/actions";

type StaffProjectQuickAddTimeProps = {
  projectId: string;
};

function getTodayDateString() {
  const now = new Date();
  const timezoneOffsetMinutes = now.getTimezoneOffset();
  const localDate = new Date(now.getTime() - timezoneOffsetMinutes * 60 * 1000);
  return localDate.toISOString().slice(0, 10);
}

export default function StaffProjectQuickAddTime({ projectId }: StaffProjectQuickAddTimeProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [hours, setHours] = useState("");
  const [billable, setBillable] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const today = useMemo(() => getTodayDateString(), []);

  async function handleSave() {
    setError(null);
    const parsedHours = parseFloat(hours);
    if (!Number.isFinite(parsedHours) || parsedHours <= 0) {
      setError("Enter a valid number of hours.");
      return;
    }

    setIsSaving(true);
    const result = await createTimeEntry({
      project_id: projectId,
      date: today,
      hours: parsedHours,
      billable_flag: billable,
    });
    setIsSaving(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    setHours("");
    setBillable(true);
    setIsOpen(false);
  }

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="app-btn app-btn-secondary focus-ring px-2.5 py-1 text-xs"
      >
        Add time
      </button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <input
          type="number"
          step="0.25"
          min="0.25"
          max="24"
          placeholder="Hours"
          value={hours}
          onChange={(e) => setHours(e.target.value)}
          className="app-input w-24 px-2 py-1 text-xs"
          aria-label="Hours"
        />
        <label className="inline-flex items-center gap-1 text-xs text-zinc-700">
          <input
            type="checkbox"
            checked={billable}
            onChange={(e) => setBillable(e.target.checked)}
            className="rounded"
          />
          Billable
        </label>
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="app-btn app-btn-primary focus-ring px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSaving ? "Saving..." : "Save"}
        </button>
        <button
          type="button"
          onClick={() => {
            setIsOpen(false);
            setError(null);
          }}
          disabled={isSaving}
          className="app-btn app-btn-secondary focus-ring px-2 py-1 text-xs"
        >
          Cancel
        </button>
      </div>
      <p className="text-[11px] text-zinc-500">Logs against today ({today})</p>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
