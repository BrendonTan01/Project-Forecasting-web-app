"use client";

import { useEffect, useMemo, useState } from "react";
import { Select } from "@/components/ui/primitives";
import type { SkillItem } from "@/app/api/skills/route";

export type OfficeOption = { id: string; name: string };

export type CapacityPlannerFilterState = {
  officeIds: string[];
  skillId: string | null;
  weeks: number;
};

const WEEK_PRESETS = [
  { value: 4, label: "4 weeks" },
  { value: 8, label: "8 weeks" },
  { value: 12, label: "12 weeks" },
  { value: 26, label: "26 weeks" },
] as const;

interface CapacityPlannerFiltersProps {
  offices: OfficeOption[];
  state: CapacityPlannerFilterState;
  onChange: (state: CapacityPlannerFilterState) => void;
  onExportPlan?: () => void;
}

export default function CapacityPlannerFilters({
  offices,
  state,
  onChange,
  onExportPlan,
}: CapacityPlannerFiltersProps) {
  const [skills, setSkills] = useState<SkillItem[]>([]);

  useEffect(() => {
    fetch("/api/skills")
      .then((res) => (res.ok ? res.json() : { skills: [] }))
      .then((data) => setSkills(data.skills ?? []))
      .catch(() => setSkills([]));
  }, []);

  const handleSkillChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const v = e.target.value;
    onChange({ ...state, skillId: v ? v : null });
  };

  const handleWeeksChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const v = parseInt(e.target.value, 10);
    if (!isNaN(v)) onChange({ ...state, weeks: v });
  };

  const selectedOffice = useMemo(
    () => (state.officeIds.length === 1 ? state.officeIds[0] : ""),
    [state.officeIds]
  );

  const handleOfficeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    onChange({ ...state, officeIds: value ? [value] : [] });
  };

  return (
    <section className="space-y-3 rounded-xl border border-[color:color-mix(in_srgb,var(--border)_20%,transparent)] bg-[color:var(--surface-lowest)] p-4 shadow-[var(--shadow-soft)]">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <div>
          <label
            htmlFor="weeks-filter"
            className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-zinc-500"
          >
            Timeframe
          </label>
          <Select
            id="weeks-filter"
            value={state.weeks}
            onChange={handleWeeksChange}
            className="w-full"
          >
            {WEEK_PRESETS.map((w) => (
              <option key={w.value} value={w.value}>
                {w.label}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <label
            htmlFor="office-filter"
            className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-zinc-500"
          >
            Office location
          </label>
          <Select
            id="office-filter"
            value={selectedOffice}
            onChange={handleOfficeChange}
            className="w-full"
          >
            <option value="">All offices</option>
            {offices.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <label
            htmlFor="skill-filter"
            className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-zinc-500"
          >
            Skill filter
          </label>
          <Select
            id="skill-filter"
            value={state.skillId ?? ""}
            onChange={handleSkillChange}
            className="w-full"
          >
            <option value="">All skills</option>
            {skills.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </div>

        <div className="md:col-span-2 xl:col-span-2">
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-zinc-500">
            Actions
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="app-btn app-btn-secondary px-3 py-2 text-xs"
              onClick={() => onChange({ ...state, officeIds: [], skillId: null })}
            >
              Clear filters
            </button>
            <button
              type="button"
              className="app-btn app-btn-primary px-3 py-2 text-xs"
              onClick={onExportPlan}
            >
              Export plan
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
