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
      <div className="app-toolbar flex items-center gap-2 p-2">
        <button
          type="button"
          onClick={() => setTab("overview")}
          className={`app-btn rounded-full px-4 py-1.5 text-xs font-semibold focus-ring ${
            tab === "overview"
              ? "app-btn-primary"
              : "app-btn-secondary text-[color:var(--muted-text)]"
          }`}
        >
          Overview
        </button>
        <button
          type="button"
          onClick={() => setTab("staff")}
          className={`app-btn rounded-full px-4 py-1.5 text-xs font-semibold focus-ring ${
            tab === "staff"
              ? "app-btn-primary"
              : "app-btn-secondary text-[color:var(--muted-text)]"
          }`}
        >
          Staff assignments
        </button>
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
