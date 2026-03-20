"use client";

import { useState } from "react";
import CapacityPlannerOverview from "./CapacityPlannerOverview";
import CapacityPlannerClient from "./CapacityPlannerClient";
import type { CapacityPlannerResponse } from "@/app/api/capacity-planner/route";
import { ForecastTable } from "@/components/api-views/ForecastTable";
import { StaffingGapsTable } from "@/components/api-views/StaffingGapsTable";

type Tab = "office-overview" | "staff-assignments" | "forecasting";

interface CapacityPlannerTabsProps {
  staffInitialData: CapacityPlannerResponse | null;
  staffFetchError: string | null;
  canEdit: boolean;
}

export default function CapacityPlannerTabs({
  staffInitialData,
  staffFetchError,
  canEdit,
}: CapacityPlannerTabsProps) {
  const [tab, setTab] = useState<Tab>("office-overview");

  return (
    <div className="space-y-5">
      <div className="border-b border-[color:color-mix(in_srgb,var(--border)_26%,transparent)]">
        <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setTab("office-overview")}
            className={`focus-ring rounded-t-md border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
            tab === "office-overview"
                ? "border-[color:var(--accent)] text-zinc-900"
                : "border-transparent text-[color:var(--muted-text)] hover:text-zinc-900"
          }`}
        >
          Office overview
        </button>
        <button
          type="button"
          onClick={() => setTab("staff-assignments")}
            className={`focus-ring rounded-t-md border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
            tab === "staff-assignments"
                ? "border-[color:var(--accent)] text-zinc-900"
                : "border-transparent text-[color:var(--muted-text)] hover:text-zinc-900"
          }`}
        >
          Staff assignments
        </button>
        <button
          type="button"
          onClick={() => setTab("forecasting")}
          className={`focus-ring rounded-t-md border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
            tab === "forecasting"
              ? "border-[color:var(--accent)] text-zinc-900"
              : "border-transparent text-[color:var(--muted-text)] hover:text-zinc-900"
          }`}
        >
          Forecasting
        </button>
        </div>
      </div>

      {tab === "office-overview" && <CapacityPlannerOverview />}

      {tab === "staff-assignments" && (
        <>
          {staffFetchError && (
            <div className="app-alert app-alert-error">
              <p className="text-sm">{staffFetchError}</p>
            </div>
          )}
          {staffInitialData && !staffFetchError && (
            <CapacityPlannerClient
              initialData={staffInitialData}
              canEdit={canEdit}
            />
          )}
          {!staffInitialData && !staffFetchError && (
            <p className="text-sm text-[color:var(--muted-text)]">
              Loading staff capacity data…
            </p>
          )}
        </>
      )}

      {tab === "forecasting" && (
        <div className="space-y-5">
          <section className="rounded-xl border border-[color:color-mix(in_srgb,var(--border)_20%,transparent)] bg-[color:var(--surface-lowest)] p-4 shadow-[var(--shadow-soft)]">
            <h3 className="text-sm font-semibold text-zinc-900">Weekly utilization forecast</h3>
            <p className="mt-1 text-xs text-[color:var(--muted-text)]">
              Projected capacity vs project load for the next 12 weeks.
            </p>
            <div className="mt-4">
              <ForecastTable weeks={12} />
            </div>
          </section>

          <section className="rounded-xl border border-[color:color-mix(in_srgb,var(--border)_20%,transparent)] bg-[color:var(--surface-lowest)] p-4 shadow-[var(--shadow-soft)]">
            <h3 className="text-sm font-semibold text-zinc-900">Staffing gaps</h3>
            <p className="mt-1 text-xs text-[color:var(--muted-text)]">
              Gap converted to hours and people-equivalent per week.
            </p>
            <div className="mt-4">
              <StaffingGapsTable weeks={12} />
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
