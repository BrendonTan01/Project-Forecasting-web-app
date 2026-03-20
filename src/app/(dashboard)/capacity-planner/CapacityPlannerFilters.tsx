"use client";

import { useEffect, useState } from "react";
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
}

export default function CapacityPlannerFilters({
  offices,
  state,
  onChange,
}: CapacityPlannerFiltersProps) {
  const [skills, setSkills] = useState<SkillItem[]>([]);

  useEffect(() => {
    fetch("/api/skills")
      .then((res) => (res.ok ? res.json() : { skills: [] }))
      .then((data) => setSkills(data.skills ?? []))
      .catch(() => setSkills([]));
  }, []);

  const handleOfficeToggle = (officeId: string) => {
    const isAll = state.officeIds.length === 0;
    const next = isAll
      ? offices.filter((o) => o.id !== officeId).map((o) => o.id)
      : state.officeIds.includes(officeId)
        ? state.officeIds.filter((id) => id !== officeId)
        : [...state.officeIds, officeId];
    onChange({ ...state, officeIds: next });
  };

  const handleSelectAllOffices = () => {
    onChange({ ...state, officeIds: [] });
  };

  const handleSkillChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const v = e.target.value;
    onChange({ ...state, skillId: v ? v : null });
  };

  const handleWeeksChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const v = parseInt(e.target.value, 10);
    if (!isNaN(v)) onChange({ ...state, weeks: v });
  };

  const allOfficesSelected =
    state.officeIds.length === 0 || state.officeIds.length === offices.length;

  return (
    <aside className="w-60 shrink-0 space-y-4 rounded-xl border border-[color:color-mix(in_srgb,var(--border)_20%,transparent)] bg-[color:var(--surface-lowest)] p-4 shadow-[var(--shadow-soft)]">
      <h2 className="text-sm font-semibold text-zinc-800">Filters</h2>

      {/* Office */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-zinc-500">
          Office
        </label>
        <button
          type="button"
          onClick={handleSelectAllOffices}
          className={`mb-2 block w-full rounded-md border px-2 py-1.5 text-left text-sm focus-ring ${
            allOfficesSelected
              ? "border-zinc-300 bg-zinc-100 text-zinc-900"
              : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
          }`}
        >
          All offices
        </button>
        {offices.length > 0 && (
          <div className="max-h-32 space-y-1 overflow-y-auto">
            {offices.map((o) => (
              <label
                key={o.id}
                className="flex cursor-pointer items-center gap-2 text-sm text-zinc-700"
              >
                <input
                  type="checkbox"
                  checked={
                    allOfficesSelected || state.officeIds.includes(o.id)
                  }
                  onChange={() => handleOfficeToggle(o.id)}
                  className="rounded border-zinc-300 text-zinc-600 focus:ring-zinc-500"
                />
                <span className="truncate">{o.name}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Skill */}
      <div>
        <label
          htmlFor="skill-filter"
          className="mb-1.5 block text-xs font-medium text-zinc-500"
        >
          Skill
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
        {skills.length === 0 && (
          <p className="mt-1 text-xs text-zinc-400">No skills configured</p>
        )}
      </div>

      {/* Time range */}
      <div>
        <label
          htmlFor="weeks-filter"
          className="mb-1.5 block text-xs font-medium text-zinc-500"
        >
          Time range
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
    </aside>
  );
}
