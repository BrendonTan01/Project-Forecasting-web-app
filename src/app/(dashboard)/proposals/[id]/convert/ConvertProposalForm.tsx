"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { convertProposalToProject } from "../../actions";
import { Button, Card, Input } from "@/components/ui/primitives";

type Skill = { id: string; name: string; required_hours_per_week?: number };

function parseOptionalNumber(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

type ConvertProposalFormProps = {
  proposalId: string;
  proposalName: string;
  offices: { id: string; name: string }[];
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

  function toggleOffice(id: string) {
    setSelectedOffices((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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

    const result = await convertProposalToProject(proposalId, {
      name,
      client_name: (formData.get("client_name") as string)?.trim() || undefined,
      start_date: (formData.get("start_date") as string) || undefined,
      end_date: (formData.get("end_date") as string) || undefined,
      estimated_hours: estimatedHoursRaw ? parseFloat(estimatedHoursRaw) : undefined,
      office_scope: limitToSelectedOffices ? Array.from(selectedOffices) : null,
      notes: (formData.get("notes") as string)?.trim() || undefined,
      skills: editedSkills,
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
