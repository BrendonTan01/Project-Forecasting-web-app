"use client";

import { useState } from "react";
import CapacityPlannerOverview from "./CapacityPlannerOverview";
import CapacityPlannerClient from "./CapacityPlannerClient";
import type { CapacityPlannerResponse } from "@/app/api/capacity-planner/route";

type Tab = "overview" | "staff";

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
  const [tab, setTab] = useState<Tab>("overview");

  return (
    <div className="space-y-5">
      <div className="border-b border-[color:color-mix(in_srgb,var(--border)_26%,transparent)]">
        <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setTab("overview")}
            className={`focus-ring rounded-t-md border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
            tab === "overview"
                ? "border-[color:var(--accent)] text-zinc-900"
                : "border-transparent text-[color:var(--muted-text)] hover:text-zinc-900"
          }`}
        >
          Overview
        </button>
        <button
          type="button"
          onClick={() => setTab("staff")}
            className={`focus-ring rounded-t-md border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
            tab === "staff"
                ? "border-[color:var(--accent)] text-zinc-900"
                : "border-transparent text-[color:var(--muted-text)] hover:text-zinc-900"
          }`}
        >
          Staff assignments
        </button>
        </div>
      </div>

      {tab === "overview" && <CapacityPlannerOverview />}

      {tab === "staff" && (
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
    </div>
  );
}
