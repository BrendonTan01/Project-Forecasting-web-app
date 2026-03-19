"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { convertProposalToProject } from "../../actions";
import { Button, Card, Input } from "@/components/ui/primitives";

type Skill = { id: string; name: string; required_hours_per_week?: number };

export type ProposedTeamMemberResolved = {
  staff_id: string;
  split_percent: number;
  name: string;
  role: string;
  office: string;
  weekly_capacity_hours: number;
};

function parseOptionalNumber(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function round1(v: number) {
  return Math.round(v * 10) / 10;
}

type ConvertProposalFormProps = {
  proposalId: string;
  proposalName: string;
  offices: { id: string; name: string }[];
  proposedTeam?: ProposedTeamMemberResolved[];
  estimatedHoursPerWeek?: number | null;
  defaults: {
    name: string;
    client_name: string | null;
    start_date: string | null;
    end_date: string | null;
    estimated_hours: number | null;
    office_scope: string[] | null;
    notes: string | null;
    skills: Skill[];
  };
};

export function ConvertProposalForm({
  proposalId,
  proposalName,
  offices,
  proposedTeam = [],
  estimatedHoursPerWeek = null,
  defaults,
}: ConvertProposalFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const initialOfficeScope = defaults.office_scope ?? [];
  const [selectedOffices, setSelectedOffices] = useState<Set<string>>(
    () => new Set(initialOfficeScope)
  );
  const [limitToSelectedOffices, setLimitToSelectedOffices] = useState(
    initialOfficeScope.length > 0
  );
  const [skillHoursById, setSkillHoursById] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      defaults.skills.map((skill) => [
        skill.id,
        skill.required_hours_per_week !== undefined && skill.required_hours_per_week !== null
          ? `${skill.required_hours_per_week}`
          : "",
      ])
    )
  );

  // Per-member allocation % override (defaults to computed from split_percent + weekly capacity)
  const [teamAllocationById, setTeamAllocationById] = useState<Record<string, string>>(() => {
    const result: Record<string, string> = {};
    for (const member of proposedTeam) {
      if (estimatedHoursPerWeek && member.weekly_capacity_hours > 0) {
        const weeklyHours = round1((estimatedHoursPerWeek * member.split_percent) / 100);
        const allocPct = round1((weeklyHours / member.weekly_capacity_hours) * 100);
        result[member.staff_id] = String(allocPct);
      } else {
        result[member.staff_id] = String(member.split_percent);
      }
    }
    return result;
  });

  function toggleOffice(id: string) {
    setSelectedOffices((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleAllocationChange(staffId: string, value: string) {
    setTeamAllocationById((prev) => ({ ...prev, [staffId]: value }));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const form = e.currentTarget;
    const formData = new FormData(form);

    const name = (formData.get("name") as string)?.trim() ?? "";
    if (!name) {
      setError("Project name is required");
      setSubmitting(false);
      return;
    }
    if (limitToSelectedOffices && selectedOffices.size === 0) {
      setError("Choose at least one office, or switch office scope to all offices.");
      setSubmitting(false);
      return;
    }

    const estimatedHoursRaw = formData.get("estimated_hours") as string;
    const editedSkills = defaults.skills.map((skill) => {
      const parsedHours = parseOptionalNumber(skillHoursById[skill.id] ?? "");
      return parsedHours === undefined
        ? { id: skill.id, name: skill.name }
        : { id: skill.id, name: skill.name, required_hours_per_week: parsedHours };
    });

    const hasNegativeSkillHours = editedSkills.some(
      (skill) =>
        skill.required_hours_per_week !== undefined && skill.required_hours_per_week < 0
    );
    if (hasNegativeSkillHours) {
      setError("Skill required hours per week cannot be negative.");
      setSubmitting(false);
      return;
    }

    const teamAssignments = proposedTeam.map((member) => {
      const allocPctRaw = teamAllocationById[member.staff_id] ?? "";
      const allocPct = parseOptionalNumber(allocPctRaw) ?? member.split_percent;
      const weeklyHours = estimatedHoursPerWeek
        ? round1((estimatedHoursPerWeek * member.split_percent) / 100)
        : round1((member.weekly_capacity_hours * allocPct) / 100);
      return {
        staff_id: member.staff_id,
        allocation_percentage: Math.min(200, Math.max(0, allocPct)),
        weekly_hours_allocated: weeklyHours,
      };
    });

    const result = await convertProposalToProject(proposalId, {
      name,
      client_name: (formData.get("client_name") as string)?.trim() || undefined,
      start_date: (formData.get("start_date") as string) || undefined,
      end_date: (formData.get("end_date") as string) || undefined,
      estimated_hours: estimatedHoursRaw ? parseFloat(estimatedHoursRaw) : undefined,
      office_scope: limitToSelectedOffices ? Array.from(selectedOffices) : null,
      notes: (formData.get("notes") as string)?.trim() || undefined,
      skills: editedSkills,
      team_assignments: teamAssignments.length > 0 ? teamAssignments : undefined,
    });

    if (result.error) {
      setError(result.error);
      setSubmitting(false);
      return;
    }

    router.push(`/projects/${result.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-xl space-y-4">
      <Card className="space-y-4 p-6">
        {/* Origin banner */}
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3">
          <p className="text-sm text-emerald-800">
            Converting proposal: <span className="font-semibold">{proposalName}</span>
          </p>
          <p className="mt-0.5 text-xs text-emerald-700">
            Review and confirm the details below. Skills will be carried over automatically.
          </p>
        </div>

        {error && <p className="app-alert app-alert-error">{error}</p>}

        <div>
          <label htmlFor="name" className="mb-1 block text-sm font-medium text-zinc-700">
            Project name *
          </label>
          <Input
            id="name"
            name="name"
            type="text"
            required
            defaultValue={defaults.name}
            placeholder="e.g. Bridge Design Phase 1"
          />
        </div>

        <div>
          <label htmlFor="client_name" className="mb-1 block text-sm font-medium text-zinc-700">
            Client name
          </label>
          <Input
            id="client_name"
            name="client_name"
            type="text"
            defaultValue={defaults.client_name ?? ""}
            placeholder="e.g. City Council"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="estimated_hours" className="mb-1 block text-sm font-medium text-zinc-700">
              Estimated hours
            </label>
            <Input
              id="estimated_hours"
              name="estimated_hours"
              type="number"
              min="0"
              step="0.5"
              defaultValue={defaults.estimated_hours ?? ""}
              placeholder="e.g. 400"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700">
              Status
            </label>
            <div className="flex h-10 items-center rounded-md border border-zinc-200 bg-zinc-50 px-3 text-sm text-zinc-500">
              Active (set on creation)
            </div>
          </div>
        </div>

        {offices.length > 0 && (
          <div className="app-card-soft p-4">
            <h2 className="mb-1 font-medium text-zinc-900">Project office scope</h2>
            <p className="mb-3 text-xs text-zinc-500">
              Restrict this project to selected offices, or leave it open to all offices.
            </p>
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                role="switch"
                aria-checked={limitToSelectedOffices}
                onClick={() =>
                  setLimitToSelectedOffices((prev) => {
                    const next = !prev;
                    if (next && selectedOffices.size === 0 && offices.length > 0) {
                      setSelectedOffices(new Set([offices[0].id]));
                    }
                    return next;
                  })
                }
                className="app-toggle focus-ring"
                data-on={limitToSelectedOffices}
              >
                <span className="app-toggle-thumb" />
              </button>
              <span className="text-sm text-zinc-700">
                {limitToSelectedOffices ? "Selected offices only" : "All offices"}
              </span>
            </div>
            {limitToSelectedOffices ? (
              <div className="flex flex-wrap gap-2">
                {offices.map((office) => {
                  const checked = selectedOffices.has(office.id);
                  return (
                    <button
                      key={office.id}
                      type="button"
                      onClick={() => toggleOffice(office.id)}
                      className={`rounded-full border px-3 py-1 text-sm font-medium transition-colors ${
                        checked
                          ? "border-zinc-900 bg-zinc-900 text-white"
                          : "border-zinc-300 text-zinc-600 hover:border-zinc-500 hover:text-zinc-900"
                      }`}
                    >
                      {office.name}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-zinc-400">Every office is in scope for this project.</p>
            )}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="start_date" className="mb-1 block text-sm font-medium text-zinc-700">
              Start date
            </label>
            <Input
              id="start_date"
              name="start_date"
              type="date"
              defaultValue={defaults.start_date ?? ""}
            />
          </div>
          <div>
            <label htmlFor="end_date" className="mb-1 block text-sm font-medium text-zinc-700">
              End date
            </label>
            <Input
              id="end_date"
              name="end_date"
              type="date"
              defaultValue={defaults.end_date ?? ""}
            />
          </div>
        </div>

        {defaults.skills.length > 0 && (
          <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
            <p className="mb-2 text-sm font-medium text-zinc-700">
              Skills carried over ({defaults.skills.length})
            </p>
            <p className="mb-3 text-xs text-zinc-500">
              Review and adjust required hours/week for each skill before creating the project.
            </p>
            <div className="space-y-2">
              {defaults.skills.map((skill) => (
                <div
                  key={skill.id}
                  className="grid grid-cols-12 items-center gap-2 rounded border border-zinc-300 bg-white px-3 py-2"
                >
                  <span className="col-span-7 text-sm font-medium text-zinc-800">{skill.name}</span>
                  <label
                    htmlFor={`skill-hours-${skill.id}`}
                    className="col-span-3 text-right text-xs text-zinc-500"
                  >
                    Hrs/week
                  </label>
                  <Input
                    id={`skill-hours-${skill.id}`}
                    type="number"
                    min="0"
                    step="0.5"
                    value={skillHoursById[skill.id] ?? ""}
                    onChange={(e) =>
                      setSkillHoursById((prev) => ({
                        ...prev,
                        [skill.id]: e.target.value,
                      }))
                    }
                    className="col-span-2 app-input px-2 py-1 text-sm"
                    placeholder="0"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {proposedTeam.length > 0 && (
          <div className="rounded-md border border-blue-200 bg-blue-50 p-4">
            <p className="mb-1 text-sm font-medium text-blue-900">
              Proposed team ({proposedTeam.length} member{proposedTeam.length !== 1 ? "s" : ""})
            </p>
            <p className="mb-3 text-xs text-blue-700">
              These staff members will be assigned to the project on creation. Review and adjust allocation percentages as needed.
              {estimatedHoursPerWeek
                ? ` Weekly hours shown are based on ${estimatedHoursPerWeek}h/week × split %.`
                : ""}
            </p>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-blue-200">
                    <th className="py-1.5 pr-3 text-left text-xs font-semibold text-blue-800">Staff member</th>
                    <th className="py-1.5 pr-3 text-right text-xs font-semibold text-blue-800">Split %</th>
                    {estimatedHoursPerWeek && (
                      <th className="py-1.5 pr-3 text-right text-xs font-semibold text-blue-800">Weekly hrs</th>
                    )}
                    <th className="py-1.5 text-right text-xs font-semibold text-blue-800">Allocation %</th>
                  </tr>
                </thead>
                <tbody>
                  {proposedTeam.map((member) => {
                    const weeklyHours = estimatedHoursPerWeek
                      ? round1((estimatedHoursPerWeek * member.split_percent) / 100)
                      : null;
                    const allocPctStr = teamAllocationById[member.staff_id] ?? "";
                    return (
                      <tr key={member.staff_id} className="border-b border-blue-100 last:border-0">
                        <td className="py-1.5 pr-3 text-zinc-900">
                          <p className="font-medium">{member.name}</p>
                          <p className="text-xs text-zinc-500">{member.role} · {member.office}</p>
                        </td>
                        <td className="py-1.5 pr-3 text-right text-zinc-700">{member.split_percent}%</td>
                        {estimatedHoursPerWeek && (
                          <td className="py-1.5 pr-3 text-right text-zinc-700">{weeklyHours}h/wk</td>
                        )}
                        <td className="py-1.5 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Input
                              type="number"
                              min="0"
                              max="200"
                              step="1"
                              value={allocPctStr}
                              onChange={(e) => handleAllocationChange(member.staff_id, e.target.value)}
                              className="w-20 app-input px-2 py-1 text-right text-sm"
                            />
                            <span className="text-xs text-zinc-500">%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div>
          <label htmlFor="notes" className="mb-1 block text-sm font-medium text-zinc-700">
            Notes
          </label>
          <textarea
            id="notes"
            name="notes"
            rows={3}
            defaultValue={defaults.notes ?? ""}
            placeholder="Any additional context or notes…"
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
          />
        </div>

        <div className="flex gap-3 pt-2">
          <Button type="submit" disabled={submitting}>
            {submitting ? "Creating project…" : "Create project"}
          </Button>
          <Link
            href={`/proposals/${proposalId}`}
            className="app-btn app-btn-secondary focus-ring px-4 py-2 text-sm"
          >
            Cancel
          </Link>
        </div>
      </Card>
    </form>
  );
}
