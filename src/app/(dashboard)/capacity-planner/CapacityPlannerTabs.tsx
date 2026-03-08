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
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setTab("overview")}
          className={`rounded border px-3 py-1.5 text-sm font-medium focus-ring ${
            tab === "overview"
              ? "border-zinc-300 bg-zinc-100 text-zinc-900"
              : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
          }`}
        >
          Overview
        </button>
        <button
          type="button"
          onClick={() => setTab("staff")}
          className={`rounded border px-3 py-1.5 text-sm font-medium focus-ring ${
            tab === "staff"
              ? "border-zinc-300 bg-zinc-100 text-zinc-900"
              : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
          }`}
        >
          Staff assignments
        </button>
      </div>

      {tab === "overview" && <CapacityPlannerOverview />}

      {tab === "staff" && (
        <>
          {staffFetchError && (
            <div className="rounded border border-red-200 bg-red-50 px-4 py-3">
              <p className="text-sm text-red-700">{staffFetchError}</p>
            </div>
          )}
          {staffInitialData && !staffFetchError && (
            <CapacityPlannerClient
              initialData={staffInitialData}
              canEdit={canEdit}
            />
          )}
          {!staffInitialData && !staffFetchError && (
            <p className="text-sm text-zinc-500">
              Loading staff capacity data…
            </p>
          )}
        </>
      )}
    </div>
  );
}
