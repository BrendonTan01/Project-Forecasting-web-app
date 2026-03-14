"use client";

import { useEffect, useState, useCallback } from "react";
import { CapacityHeatmap } from "@/components/api-views/CapacityHeatmap";
import CapacityPlannerFilters, {
  type CapacityPlannerFilterState,
  type OfficeOption,
} from "./CapacityPlannerFilters";
import CapacityDetailDrawer, { type SelectedCell } from "./CapacityDetailDrawer";
import type { CapacityHeatmapResponse } from "@/app/api/capacity-heatmap/route";
import type { SkillItem } from "@/app/api/skills/route";

const DEFAULT_FILTER_STATE: CapacityPlannerFilterState = {
  officeIds: [],
  skillId: null,
  weeks: 12,
};

export default function CapacityPlannerOverview() {
  const [filterState, setFilterState] =
    useState<CapacityPlannerFilterState>(DEFAULT_FILTER_STATE);
  const [heatmapData, setHeatmapData] =
    useState<CapacityHeatmapResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCell, setSelectedCell] = useState<SelectedCell | null>(null);
  const [skills, setSkills] = useState<SkillItem[]>([]);

  useEffect(() => {
    fetch("/api/skills")
      .then((res) => (res.ok ? res.json() : { skills: [] }))
      .then((data) => setSkills(data.skills ?? []))
      .catch(() => setSkills([]));
  }, []);

  const fetchHeatmap = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ weeks: String(filterState.weeks) });
    if (filterState.skillId) params.set("skillId", filterState.skillId);
    try {
      const res = await fetch(`/api/capacity-heatmap?${params.toString()}`);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const data = (await res.json()) as CapacityHeatmapResponse;
      setHeatmapData(data);
    } catch (err) {
      setHeatmapData(null);
      setError(err instanceof Error ? err.message : "Failed to load heatmap");
    } finally {
      setLoading(false);
    }
  }, [filterState.weeks, filterState.skillId]);

  useEffect(() => {
    fetchHeatmap();
  }, [fetchHeatmap]);

  const offices: OfficeOption[] = heatmapData?.offices ?? [];
  const selectedSkillName =
    filterState.skillId
      ? skills.find((skill) => skill.id === filterState.skillId)?.name ?? "Unknown skill"
      : null;

  return (
    <div className="flex gap-4">
      <CapacityPlannerFilters
        offices={offices}
        state={filterState}
        onChange={setFilterState}
      />

      <main className="min-w-0 flex-1">
        {selectedSkillName && (
          <div className="mb-3 rounded border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
            Filtered by skill:{" "}
            <span className="font-medium text-zinc-900">{selectedSkillName}</span>
          </div>
        )}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <p className="text-sm text-zinc-500">Loading capacity heatmap…</p>
          </div>
        )}
        {error && (
          <div className="rounded border border-red-200 bg-red-50 px-4 py-3">
            <p className="text-sm text-red-700">Failed to load: {error}</p>
          </div>
        )}
        {heatmapData && !loading && (
          <div className="rounded border border-zinc-200 bg-white p-4">
            <CapacityHeatmap
              weeks={filterState.weeks}
              officeIds={
                filterState.officeIds.length > 0
                  ? filterState.officeIds
                  : undefined
              }
              skillId={filterState.skillId}
              data={heatmapData}
              onCellClick={setSelectedCell}
            />
          </div>
        )}
      </main>

      {selectedCell && (
        <CapacityDetailDrawer
          cell={selectedCell}
          skillId={filterState.skillId}
          onClose={() => setSelectedCell(null)}
        />
      )}
    </div>
  );
}
