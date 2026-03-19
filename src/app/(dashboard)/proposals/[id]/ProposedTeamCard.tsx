"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { saveProposedTeam, getProposedTeamWithCapacity } from "../actions";
import type { ProposedTeamCapacityResult } from "../actions";
import type { ProposedTeamMember } from "@/lib/types";

type StaffOption = {
  id: string;
  name: string;
  role: string;
  office: string;
};

type Props = {
  proposalId: string;
  initialTeam: ProposedTeamMember[] | null;
  allStaff: StaffOption[];
  canManage: boolean;
};

function round1(v: number) {
  return Math.round(v * 10) / 10;
}

function buildEqualSplit(ids: string[]): Record<string, number> {
  if (ids.length === 0) return {};
  const base = round1(100 / ids.length);
  const split: Record<string, number> = {};
  for (const id of ids) split[id] = base;
  const total = Object.values(split).reduce((s, v) => s + v, 0);
  const remainder = round1(100 - total);
  split[ids[ids.length - 1]] = round1(split[ids[ids.length - 1]] + remainder);
  return split;
}


export function ProposedTeamCard({ proposalId, initialTeam, allStaff, canManage }: Props) {
  const [splitByStaff, setSplitByStaff] = useState<Record<string, number>>(() => {
    if (!initialTeam || initialTeam.length === 0) return {};
    return Object.fromEntries(initialTeam.map((m) => [m.staff_id, m.split_percent]));
  });
  const [selectedIds, setSelectedIds] = useState<string[]>(() =>
    initialTeam?.map((m) => m.staff_id) ?? []
  );
  const [capacityData, setCapacityData] = useState<ProposedTeamCapacityResult | null>(null);
  const [loadingCapacity, setLoadingCapacity] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  const loadCapacity = useCallback(async () => {
    setLoadingCapacity(true);
    const result = await getProposedTeamWithCapacity(proposalId);
    setLoadingCapacity(false);
    if ("error" in result) return;
    setCapacityData(result);
  }, [proposalId]);

  useEffect(() => {
    if (initialTeam && initialTeam.length > 0) {
      loadCapacity();
    }
  }, [initialTeam, loadCapacity]);

  const currentTeam: ProposedTeamMember[] = selectedIds.map((id) => ({
    staff_id: id,
    split_percent: splitByStaff[id] ?? 0,
  }));

  const splitTotal = round1(Object.entries(splitByStaff)
    .filter(([id]) => selectedIds.includes(id))
    .reduce((sum, [, v]) => sum + v, 0));
  const splitValid = selectedIds.length === 0 || Math.abs(splitTotal - 100) < 0.1;

  function addStaff(staffId: string) {
    if (selectedIds.includes(staffId)) return;
    const next = [...selectedIds, staffId];
    setSelectedIds(next);
    setSplitByStaff(buildEqualSplit(next));
    setShowPicker(false);
    setPickerSearch("");
    setIsDirty(true);
  }

  function removeStaff(staffId: string) {
    const next = selectedIds.filter((id) => id !== staffId);
    setSelectedIds(next);
    setSplitByStaff(buildEqualSplit(next));
    setIsDirty(true);
  }

  function handleSplitChange(staffId: string, value: string) {
    const parsed = Number.parseFloat(value);
    if (!Number.isFinite(parsed)) return;
    const clamped = Math.max(0, Math.min(100, parsed));
    setSplitByStaff((prev) => ({ ...prev, [staffId]: round1(clamped) }));
    setIsDirty(true);
  }

  function rebalance() {
    setSplitByStaff(buildEqualSplit(selectedIds));
    setIsDirty(true);
  }

  async function handleSave() {
    setSaveStatus("saving");
    setSaveError(null);
    const result = await saveProposedTeam(proposalId, currentTeam);
    if (result.error) {
      setSaveStatus("error");
      setSaveError(result.error);
      return;
    }
    setSaveStatus("saved");
    setIsDirty(false);
    // Reload capacity data to reflect saved state
    loadCapacity();
    setTimeout(() => setSaveStatus("idle"), 3000);
  }

  const selectedStaffDetails = selectedIds.map((id) => {
    const member = capacityData?.members.find((m) => m.staff_id === id);
    const staffInfo = allStaff.find((s) => s.id === id);
    return { id, staffInfo, member };
  });

  const coveredSkillIds = new Set(capacityData?.covered_skill_ids ?? []);
  const requiredSkills = capacityData?.required_skills ?? [];
  const allSkillsCovered = capacityData?.all_skills_covered ?? requiredSkills.length === 0;
  const totalRequired = capacityData?.total_required_hours ?? 0;

  const filteredStaff = allStaff.filter(
    (s) =>
      !selectedIds.includes(s.id) &&
      (pickerSearch === "" ||
        s.name.toLowerCase().includes(pickerSearch.toLowerCase()) ||
        s.role.toLowerCase().includes(pickerSearch.toLowerCase()) ||
        s.office.toLowerCase().includes(pickerSearch.toLowerCase()))
  );

  const planReady =
    selectedIds.length > 0 &&
    splitValid &&
    allSkillsCovered &&
    (capacityData === null ||
      capacityData.members.every((m) => m.can_cover));

  return (
    <div className="app-card p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-zinc-900">Proposed Team</h2>
          <p className="mt-0.5 text-sm text-zinc-500">
            Build and save your delivery team for this proposal. This persists across simulations and carries over when the proposal is converted to a project.
          </p>
        </div>
        {canManage && selectedIds.length > 0 && (
          <div className="flex shrink-0 items-center gap-2">
            {isDirty && (
              <span className="text-xs text-amber-600">Unsaved changes</span>
            )}
            {saveStatus === "saved" && !isDirty && (
              <span className="text-xs text-emerald-600">Saved</span>
            )}
            <button
              type="button"
              onClick={handleSave}
              disabled={saveStatus === "saving"}
              className="app-btn app-btn-primary focus-ring px-3 py-1.5 text-sm"
            >
              {saveStatus === "saving" ? "Saving…" : "Save team"}
            </button>
          </div>
        )}
      </div>

      {saveError && (
        <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{saveError}</p>
      )}

      {/* Skill coverage summary */}
      {requiredSkills.length > 0 && selectedIds.length > 0 && (
        <div className="mb-4 rounded-md border border-zinc-200 bg-zinc-50 p-3">
          <p className="text-xs font-medium text-zinc-700">
            Skill coverage: {requiredSkills.filter((s) => coveredSkillIds.has(s.id)).length}/{requiredSkills.length}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {requiredSkills.map((skill) => {
              const covered = coveredSkillIds.has(skill.id);
              return (
                <span
                  key={skill.id}
                  className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    covered ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {skill.name}
                  {skill.required_hours_per_week !== undefined
                    ? ` ${skill.required_hours_per_week}h/wk`
                    : ""}
                  {" "}
                  {covered ? "(covered)" : "(missing)"}
                </span>
              );
            })}
          </div>
          {!allSkillsCovered && (
            <p className="mt-2 text-xs text-amber-700">
              Add staff with the missing skills to fully cover the proposal requirements.
            </p>
          )}
        </div>
      )}

      {/* Team member list */}
      {selectedIds.length === 0 ? (
        <div className="rounded-md border border-dashed border-zinc-300 bg-zinc-50 py-8 text-center">
          <p className="text-sm text-zinc-500">No team members added yet.</p>
          {canManage && (
            <p className="mt-1 text-xs text-zinc-400">
              Use the button below to add staff to the proposed team.
            </p>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="app-table min-w-full">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50">
                <th className="px-3 py-2 text-left text-xs font-semibold text-zinc-700">Staff member</th>
                {requiredSkills.length > 0 && (
                  <th className="px-3 py-2 text-left text-xs font-semibold text-zinc-700">Skills</th>
                )}
                <th className="px-3 py-2 text-right text-xs font-semibold text-zinc-700">Available hrs</th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-zinc-700">Split %</th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-zinc-700">Assigned hrs</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-zinc-700">Status</th>
                {canManage && <th className="px-3 py-2" />}
              </tr>
            </thead>
            <tbody>
              {selectedStaffDetails.map(({ id, staffInfo, member }) => {
                const splitPct = splitByStaff[id] ?? 0;
                const assignedHours = round1((totalRequired * splitPct) / 100);
                const availableHours = member?.available_hours ?? null;
                const canCover = availableHours === null || availableHours >= assignedHours;
                const overby = availableHours !== null ? round1(availableHours - assignedHours) : 0;

                return (
                  <tr key={id} className="border-b border-zinc-100 last:border-0">
                    <td className="px-3 py-2 text-sm text-zinc-800">
                      <Link href={`/staff/${id}`} className="group">
                        <p className="app-link font-medium">{member?.name ?? staffInfo?.name ?? "Unknown"}</p>
                        <p className="text-xs text-zinc-500">
                          {member?.role ?? staffInfo?.role ?? "staff"} · {member?.office ?? staffInfo?.office ?? ""}
                        </p>
                      </Link>
                    </td>
                    {requiredSkills.length > 0 && (
                      <td className="px-3 py-2 text-xs text-zinc-600">
                        {member?.matching_skill_names && member.matching_skill_names.length > 0
                          ? member.matching_skill_names.join(", ")
                          : <span className="text-zinc-400">None matched</span>}
                      </td>
                    )}
                    <td className="px-3 py-2 text-right text-sm text-zinc-800">
                      {loadingCapacity ? (
                        <span className="text-zinc-400">…</span>
                      ) : availableHours !== null ? (
                        `${availableHours}h`
                      ) : (
                        <span className="text-zinc-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {canManage ? (
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={0.5}
                          value={splitPct}
                          onChange={(e) => handleSplitChange(id, e.target.value)}
                          className="app-input w-20 px-2 py-1 text-right text-sm text-zinc-800"
                        />
                      ) : (
                        <span className="text-sm text-zinc-800">{splitPct}%</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right text-sm text-zinc-800">{assignedHours}h</td>
                    <td className="px-3 py-2 text-sm">
                      {loadingCapacity ? (
                        <span className="text-xs text-zinc-400">…</span>
                      ) : availableHours !== null ? (
                        canCover ? (
                          <span className="text-xs font-medium text-emerald-700">
                            Can cover (+{overby}h spare)
                          </span>
                        ) : (
                          <span className="text-xs font-medium text-red-700">
                            Over by {Math.abs(overby)}h
                          </span>
                        )
                      ) : (
                        <span className="text-xs text-zinc-400">—</span>
                      )}
                    </td>
                    {canManage && (
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => removeStaff(id)}
                          className="text-xs text-zinc-400 hover:text-red-600 focus-ring rounded"
                          aria-label={`Remove ${member?.name ?? staffInfo?.name ?? "staff member"}`}
                        >
                          Remove
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Split validation + controls */}
          {canManage && (
            <div className="mt-3 space-y-2">
              <div
                className={`rounded-md px-3 py-2 text-xs ${
                  planReady
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-amber-50 text-amber-800"
                }`}
              >
                {planReady
                  ? "Team looks good: split totals 100%, all staff can cover their assigned hours, and required skills are covered."
                  : !splitValid
                  ? `Split must total 100% (currently ${splitTotal}%). Adjust percentages or rebalance equally.`
                  : !allSkillsCovered && requiredSkills.length > 0
                  ? "Add staff that cover the missing required skills."
                  : "One or more staff members are over their available capacity for this proposal window."}
              </div>
              <div className="flex items-center justify-between text-xs text-zinc-500">
                <span>
                  Split total:{" "}
                  <span className={splitValid ? "font-medium text-emerald-700" : "font-medium text-red-700"}>
                    {splitTotal}%
                  </span>
                </span>
                <button
                  type="button"
                  onClick={rebalance}
                  className="app-btn app-btn-secondary focus-ring px-3 py-1 text-xs"
                >
                  Rebalance equally
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add staff picker */}
      {canManage && (
        <div className="mt-4">
          {showPicker ? (
            <div className="rounded-md border border-zinc-200 bg-white shadow-sm">
              <div className="border-b border-zinc-200 p-3">
                <input
                  type="text"
                  autoFocus
                  placeholder="Search by name, role, or office…"
                  value={pickerSearch}
                  onChange={(e) => setPickerSearch(e.target.value)}
                  className="w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
                />
              </div>
              <div className="max-h-56 overflow-y-auto">
                {filteredStaff.length === 0 ? (
                  <p className="px-3 py-3 text-sm text-zinc-500">
                    {allStaff.length === selectedIds.length
                      ? "All available staff are already on the team."
                      : "No staff match your search."}
                  </p>
                ) : (
                  <ul className="divide-y divide-zinc-100">
                    {filteredStaff.map((s) => (
                      <li key={s.id}>
                        <button
                          type="button"
                          onClick={() => addStaff(s.id)}
                          className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-zinc-50 focus-ring"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-zinc-900">{s.name}</p>
                            <p className="truncate text-xs text-zinc-500">{s.role} · {s.office}</p>
                          </div>
                          <span className="shrink-0 text-xs text-zinc-400">Add</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="border-t border-zinc-200 px-3 py-2">
                <button
                  type="button"
                  onClick={() => { setShowPicker(false); setPickerSearch(""); }}
                  className="text-xs text-zinc-500 hover:text-zinc-700"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowPicker(true)}
              className="app-btn app-btn-secondary focus-ring px-3 py-1.5 text-sm"
            >
              + Add staff member
            </button>
          )}
        </div>
      )}

      {/* Save footer when team exists and has changes */}
      {canManage && selectedIds.length > 0 && isDirty && (
        <div className="mt-4 flex items-center justify-end gap-3 border-t border-zinc-100 pt-3">
          <span className="text-xs text-amber-600">You have unsaved changes to the team.</span>
          <button
            type="button"
            onClick={handleSave}
            disabled={saveStatus === "saving"}
            className="app-btn app-btn-primary focus-ring px-3 py-1.5 text-sm"
          >
            {saveStatus === "saving" ? "Saving…" : "Save team"}
          </button>
        </div>
      )}
    </div>
  );
}
