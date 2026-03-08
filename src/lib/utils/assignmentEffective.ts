import {
  startOfCurrentWeekUtc,
  toDateString,
  rangesOverlap,
  weekEndFromWeekStart,
} from "@/lib/utils/week";

type ProjectWindow =
  | {
      start_date: string | null;
      end_date: string | null;
      status?: string | null;
    }
  | {
      start_date: string | null;
      end_date: string | null;
      status?: string | null;
    }[]
  | null;

export type EffectiveAssignmentRow = {
  staff_id: string;
  project_id: string;
  week_start: string | null;
  weekly_hours_allocated: number;
  projects?: ProjectWindow;
};

function normalizeProject(project: ProjectWindow): {
  start_date: string | null;
  end_date: string | null;
  status?: string | null;
} | null {
  if (Array.isArray(project)) return project[0] ?? null;
  return project ?? null;
}

export function getCurrentWeekMondayString(now: Date = new Date()): string {
  return toDateString(startOfCurrentWeekUtc(now));
}

function projectOverlapsWeek(
  projectStart: string | null,
  projectEnd: string | null,
  weekStart: string
): boolean {
  const weekEnd = weekEndFromWeekStart(weekStart);
  const safeProjectStart = projectStart ?? "0000-01-01";
  const safeProjectEnd = projectEnd ?? "9999-12-31";
  return rangesOverlap(safeProjectStart, safeProjectEnd, weekStart, weekEnd);
}

export function filterEffectiveAssignmentsForWeek<T extends EffectiveAssignmentRow>(
  rows: T[],
  weekStart: string
): T[] {
  const weeklyOverrideKeys = new Set<string>();
  for (const row of rows) {
    const project = normalizeProject(row.projects ?? null);
    if (project?.status && project.status !== "active") continue;
    if (row.week_start !== null) {
      weeklyOverrideKeys.add(`${row.staff_id}::${row.project_id}::${row.week_start}`);
    }
  }

  const result: T[] = [];
  for (const row of rows) {
    const project = normalizeProject(row.projects ?? null);
    if (project?.status && project.status !== "active") continue;

    if (row.week_start !== null) {
      if (row.week_start === weekStart) {
        result.push(row);
      }
      continue;
    }

    const overrideKey = `${row.staff_id}::${row.project_id}::${weekStart}`;
    if (weeklyOverrideKeys.has(overrideKey)) {
      continue;
    }

    if (
      project &&
      !projectOverlapsWeek(project.start_date ?? null, project.end_date ?? null, weekStart)
    ) {
      continue;
    }

    result.push(row);
  }

  return result;
}
