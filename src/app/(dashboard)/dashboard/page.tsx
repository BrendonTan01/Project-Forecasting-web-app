import { getCurrentUserWithTenant } from "@/lib/supabase/auth-helpers";
import Link from "next/link";
import { UtilizationTable } from "@/components/api-views/UtilizationTable";
import { StaffingGapsTable } from "@/components/api-views/StaffingGapsTable";
import { ForecastTable } from "@/components/api-views/ForecastTable";
import {
  calculateUtilisation,
  getUtilisationStatus,
} from "@/lib/utils/utilisation";
import {
  getProjectHealthStatus,
  getProjectHealthReason,
  getProjectHealthLabel,
  getProjectHealthColour,
  buildRecentWeeklyHoursByProject,
} from "@/lib/utils/projectHealth";
import { getRelationOne } from "@/lib/utils/supabase-relations";
import {
  filterEffectiveAssignmentsForWeek,
  getCurrentWeekMondayString,
} from "@/lib/utils/assignmentEffective";
import type { ProjectHealthStatus } from "@/lib/types";
import StaffDashboard from "./StaffDashboard";
import WeeklyTrendChart from "./WeeklyTrendChart";
import { getDashboardWindowData } from "@/lib/dashboard/data";
import DashboardOverviewClient from "@/components/dashboard/DashboardOverviewClient";

// Period: last 30 days for utilisation
function getPeriodDates() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 30);
  return { start: start.toISOString().split("T")[0], end: end.toISOString().split("T")[0] };
}

function formatCountWithPercentage(count: number, total: number): string {
  const percentage = total > 0 ? (count / total) * 100 : 0;
  return `${count} (${percentage.toFixed(1)}%)`;
}

type BidMetricCard = {
  title: string;
  value: string;
  meaning: string;
  betterDirection: string;
  formula: string;
  warning?: string;
};

type TrackingSortOption = "risk" | "tracking_desc" | "tracking_asc" | "name_asc" | "name_desc";

const trackingSortOptions: { value: TrackingSortOption; label: string }[] = [
  { value: "risk", label: "Highest risk first" },
  { value: "tracking_desc", label: "Tracking % high to low" },
  { value: "tracking_asc", label: "Tracking % low to high" },
  { value: "name_asc", label: "Project name A-Z" },
  { value: "name_desc", label: "Project name Z-A" },
];

const trackingHealthFilterOptions: { value: "all" | ProjectHealthStatus; label: string }[] = [
  { value: "all", label: "All health statuses" },
  { value: "not_started", label: "Not started" },
  { value: "on_track", label: "On track" },
  { value: "at_risk", label: "At risk" },
  { value: "overrun", label: "Overrun" },
  { value: "no_estimate", label: "No estimate" },
];

function formatTrackingPercentage(
  actualHours: number,
  estimatedHours: number | null,
  startDate: string | null,
  endDate: string | null,
  recentWeeklyHours: number[]
): string {
  if (
    startDate &&
    getProjectHealthStatus(actualHours, estimatedHours, startDate, { endDate, recentWeeklyHours }) ===
      "not_started"
  ) {
    return "Not started";
  }
  if (estimatedHours == null || estimatedHours <= 0) return "N/A";
  return `${((actualHours / estimatedHours) * 100).toFixed(1)}%`;
}

function getTrackingRatio(actualHours: number, estimatedHours: number | null): number | null {
  if (estimatedHours == null || estimatedHours <= 0) return null;
  return actualHours / estimatedHours;
}

function formatProjectDate(value: string | null): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function buildDashboardUrl(health: "all" | ProjectHealthStatus, sort: TrackingSortOption): string {
  const params = new URLSearchParams();
  if (health !== "all") params.set("health", health);
  if (sort !== "risk") params.set("sort", sort);
  const query = params.toString();
  return query ? `/dashboard?${query}` : "/dashboard";
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ health?: string; sort?: string }>;
}) {
  const user = await getCurrentUserWithTenant();
  if (!user) return null;
  if (user.role === "staff") {
    return <StaffDashboard />;
  }
  const { health: healthParam, sort: sortParam } = await searchParams;

  const selectedHealthFilter: "all" | ProjectHealthStatus = trackingHealthFilterOptions.some(
    (option) => option.value === healthParam
  )
    ? (healthParam as "all" | ProjectHealthStatus)
    : "all";
  const selectedSort: TrackingSortOption = trackingSortOptions.some((option) => option.value === sortParam)
    ? (sortParam as TrackingSortOption)
    : "risk";

  const { start, end } = getPeriodDates();
  const { staffProfiles, projects, proposals, timeEntries, assignments, projectHours } =
    await getDashboardWindowData(user.tenantId, start, end, user.id);
  const currentWeekStart = getCurrentWeekMondayString();
  const effectiveAssignments = filterEffectiveAssignmentsForWeek(
    assignments.map((a) => ({
      ...a,
      weekly_hours_allocated: Number(a.weekly_hours_allocated),
    })),
    currentWeekStart
  );

  const actualByProject = projectHours.reduce<Record<string, number>>(
    (acc, row) => {
      acc[row.project_id] = (acc[row.project_id] ?? 0) + Number(row.hours);
      return acc;
    },
    {}
  );
  const recentWeeklyHoursByProject = buildRecentWeeklyHoursByProject(projectHours, 4);

  const projectsAtRisk = projects.filter((p) => {
    const actual = actualByProject[p.id] ?? 0;
    const health = getProjectHealthStatus(actual, p.estimated_hours, p.start_date, {
      endDate: p.end_date,
      recentWeeklyHours: recentWeeklyHoursByProject[p.id] ?? [],
    });
    return health === "at_risk" || health === "overrun";
  }) ?? [];
  const allCurrentProjectsTracking = projects
    .map((project) => {
      const actual = actualByProject[project.id] ?? 0;
      const health = getProjectHealthStatus(actual, project.estimated_hours, project.start_date, {
        endDate: project.end_date,
        recentWeeklyHours: recentWeeklyHoursByProject[project.id] ?? [],
      });
      const healthReason = getProjectHealthReason(actual, project.estimated_hours, project.start_date, {
        endDate: project.end_date,
        recentWeeklyHours: recentWeeklyHoursByProject[project.id] ?? [],
      });
      return {
        id: project.id,
        name: project.name,
        estimatedHours: project.estimated_hours,
        startDate: project.start_date,
        endDate: project.end_date,
        actualHours: actual,
        health,
        healthReason,
      };
    });
  const filteredProjectsTracking = selectedHealthFilter === "all"
    ? allCurrentProjectsTracking
    : allCurrentProjectsTracking.filter((project) => project.health === selectedHealthFilter);
  const currentProjectsTracking = [...filteredProjectsTracking].sort((a, b) => {
    const severityRank: Record<ProjectHealthStatus, number> = {
      overrun: 0,
      at_risk: 1,
      no_estimate: 2,
      on_track: 3,
      not_started: 4,
    };
    const ratioA = getTrackingRatio(a.actualHours, a.estimatedHours);
    const ratioB = getTrackingRatio(b.actualHours, b.estimatedHours);

    switch (selectedSort) {
      case "tracking_desc":
        return (ratioB ?? -1) - (ratioA ?? -1);
      case "tracking_asc":
        return (ratioA ?? Number.POSITIVE_INFINITY) - (ratioB ?? Number.POSITIVE_INFINITY);
      case "name_asc":
        return a.name.localeCompare(b.name);
      case "name_desc":
        return b.name.localeCompare(a.name);
      case "risk":
      default:
        return severityRank[a.health] - severityRank[b.health];
    }
  });
  const trackingSortToggleTarget: TrackingSortOption = selectedSort === "tracking_desc" ? "tracking_asc" : "tracking_desc";

  // Calculate metrics per staff (for alerts and free capacity)
  const staffMetrics = staffProfiles.map((sp) => {
    const userRelation = getRelationOne((sp as { users?: unknown }).users) as {
      email?: string | null;
    } | null;
    const weeklyAssignedHours = effectiveAssignments
      .filter((a) => a.staff_id === sp.id)
      .reduce((sum, a) => sum + Number(a.weekly_hours_allocated), 0);
    const allocationSum =
      sp.weekly_capacity_hours > 0
        ? (weeklyAssignedHours / Number(sp.weekly_capacity_hours)) * 100
        : 0;

    const capacityHours = sp.weekly_capacity_hours * (30 / 7);
    const billableHours = timeEntries
      .filter((e) => e.staff_id === sp.id && e.billable_flag)
      .reduce((s, e) => s + Number(e.hours), 0);
    const utilisation = calculateUtilisation(billableHours, capacityHours);
    const status = getUtilisationStatus(utilisation);

    return {
      id: sp.id,
      email: userRelation?.email ?? "Unknown",
      capacityHours,
      allocationSum,
      status,
    };
  });

  const underutilised = staffMetrics.filter((s) => s.status === "underutilised").length;
  const overallocated = staffMetrics.filter((s) => s.status === "overallocated").length;

  const freeCapacity30 = staffMetrics.reduce((s, m) => {
    const allocated = (m.allocationSum / 100) * m.capacityHours;
    return s + Math.max(0, m.capacityHours - allocated);
  }, 0);

  const isAdmin = user.role === "administrator";

  const relevantProposals = proposals;
  const proposalCount = relevantProposals.length;
  const freeCapacityHours = freeCapacity30;
  const totalProposalHours = relevantProposals.reduce(
    (sum, proposal) => sum + (proposal.estimated_hours ? Number(proposal.estimated_hours) : 0),
    0
  );

  const capacityCoverageRatio = freeCapacityHours > 0 ? totalProposalHours / freeCapacityHours : null;
  const capacityCoverageWarning = relevantProposals.filter((proposal) => proposal.estimated_hours === null).length;

  const proposalsWithHours = relevantProposals.filter((p) => p.estimated_hours !== null).length;
  const avgHoursPerWeek = relevantProposals
    .filter((p) => p.estimated_hours_per_week !== null)
    .reduce((sum, p) => sum + Number(p.estimated_hours_per_week), 0) /
    Math.max(relevantProposals.filter((p) => p.estimated_hours_per_week !== null).length, 1);

  const bidMetrics: BidMetricCard[] = [
    {
      title: "Capacity coverage ratio",
      value: capacityCoverageRatio === null ? "N/A" : `${capacityCoverageRatio.toFixed(2)}x`,
      meaning: "Compares total proposed work against available free capacity over the next 30 days.",
      betterDirection: "Closer to 1.0x is better (much above 1.0x means demand exceeds current free capacity).",
      formula: "Total proposed hours / free capacity (30d).",
      warning: capacityCoverageWarning > 0 ? `${capacityCoverageWarning} proposal(s) missing estimated hours` : undefined,
    },
    {
      title: "Active proposals",
      value: proposalCount > 0 ? String(proposalCount) : "—",
      meaning: "Shows the number of proposals currently in draft, submitted, or won status.",
      betterDirection: "Depends on strategy (higher means a larger pipeline, lower means a smaller pipeline).",
      formula: "Count of project proposals where status is draft, submitted, or won.",
      warning: proposalCount - proposalsWithHours > 0
        ? `${proposalCount - proposalsWithHours} proposal(s) missing hour estimates`
        : undefined,
    },
    {
      title: "Total proposed hours",
      value: totalProposalHours > 0 ? `${Math.round(totalProposalHours)}h` : "—",
      meaning: "Totals the estimated hours across active proposals to show expected upcoming workload.",
      betterDirection: "Depends on strategy and capacity (better when aligned with available capacity).",
      formula: "Sum of estimated_hours across active proposals (null values treated as 0).",
      warning: undefined,
    },
    {
      title: "Avg hrs / week (proposals)",
      value: relevantProposals.filter((p) => p.estimated_hours_per_week !== null).length > 0
        ? `${Math.round(avgHoursPerWeek)}h`
        : "—",
      meaning: "Average expected weekly effort required by proposals with a weekly estimate.",
      betterDirection: "Lower is easier on short-term capacity; higher indicates stronger weekly demand.",
      formula: "Average of estimated_hours_per_week across proposals where that value is present.",
      warning: undefined,
    },
  ];

  return (
    <div className="space-y-6">
      <h1 className="app-page-title">Executive Dashboard</h1>

      <section className="space-y-3">
        <div>
          <h2 className="font-semibold text-zinc-900">At-a-glance overview</h2>
          <p className="text-sm text-zinc-600">
            Visual summary for executives with key forecast, utilization, and capacity signals.
          </p>
        </div>
        <DashboardOverviewClient weeks={12} />
      </section>

      {/* Bid metrics for future proposals */}
      <div className="app-card p-4">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-zinc-900">Bid metrics</h2>
            <p className="text-sm text-zinc-600">
              {proposalCount > 0
                ? `Calculated from ${proposalCount} proposal(s)`
                : "No proposals yet. Add proposals to activate bid metrics."}
            </p>
          </div>
          {isAdmin && (
            <Link
              href="/proposals/new"
              className="app-btn app-btn-secondary focus-ring px-3 py-1.5 text-sm"
            >
              Add proposal
            </Link>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {bidMetrics.map((metric) => (
            <div key={metric.title} className="rounded-md border border-zinc-200 p-3">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-zinc-500">{metric.title}</p>
                <span className="group relative inline-flex">
                  <span
                    className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-zinc-300 text-[10px] font-semibold text-zinc-500"
                    aria-label={`How ${metric.title} is calculated`}
                    tabIndex={0}
                  >
                    i
                  </span>
                  <div className="pointer-events-none absolute left-1/2 top-full z-10 mt-2 hidden w-72 -translate-x-1/2 rounded-md border border-zinc-200 bg-white p-3 text-xs text-zinc-700 shadow-lg group-hover:block group-focus-within:block">
                    <p>
                      <span className="font-semibold text-zinc-900">Meaning:</span> {metric.meaning}
                    </p>
                    <p className="mt-1">
                      <span className="font-semibold text-zinc-900">Better:</span> {metric.betterDirection}
                    </p>
                    <p className="mt-1">
                      <span className="font-semibold text-zinc-900">Calculated as:</span> {metric.formula}
                    </p>
                  </div>
                </span>
              </div>
              <p className="mt-1 text-2xl font-semibold text-zinc-900">{metric.value}</p>
              {metric.warning && (
                <p className="mt-1 text-xs text-amber-700">{metric.warning}</p>
              )}
            </div>
          ))}
        </div>
      </div>

      {isAdmin && (
        <div className="app-card p-4">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-zinc-900">Current projects tracking</h2>
              <p className="text-sm text-zinc-600">
                Active projects with current progress against estimated hours.
              </p>
            </div>
            <Link
              href="/projects"
              className="app-btn app-btn-secondary focus-ring px-3 py-1.5 text-sm"
            >
              View all projects
            </Link>
          </div>
          <form action="/dashboard" method="GET" className="mb-4 flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="health-filter" className="mb-1 block text-xs font-medium text-zinc-600">
                Filter
              </label>
              <select
                id="health-filter"
                name="health"
                defaultValue={selectedHealthFilter}
                className="app-select w-auto px-3 py-1.5 text-sm text-zinc-800"
              >
                {trackingHealthFilterOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="sort-filter" className="mb-1 block text-xs font-medium text-zinc-600">
                Sort by
              </label>
              <select
                id="sort-filter"
                name="sort"
                defaultValue={selectedSort}
                className="app-select w-auto px-3 py-1.5 text-sm text-zinc-800"
              >
                {trackingSortOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              className="app-btn app-btn-primary focus-ring px-3 py-1.5 text-sm"
            >
              Apply
            </button>
            <Link
              href={buildDashboardUrl(selectedHealthFilter, trackingSortToggleTarget)}
              className="app-btn app-btn-secondary focus-ring px-3 py-1.5 text-sm"
            >
              Sort by tracking {trackingSortToggleTarget === "tracking_desc" ? "high to low" : "low to high"}
            </Link>
            <Link
              href="/dashboard"
              className="app-btn app-btn-secondary focus-ring px-3 py-1.5 text-sm"
            >
              Reset
            </Link>
          </form>
          {currentProjectsTracking.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full whitespace-nowrap">
                <thead>
                  <tr className="border-b border-zinc-200 text-left text-sm font-semibold text-zinc-800">
                    <th className="px-3 pb-2">Project</th>
                    <th className="px-3 pb-2 text-right">Estimated</th>
                    <th className="px-3 pb-2 text-right">Actual</th>
                    <th className="px-3 pb-2">Start date</th>
                    <th className="px-3 pb-2">End date</th>
                    <th className="px-3 pb-2 text-right">Tracking</th>
                    <th className="px-3 pb-2 text-right">Health</th>
                  </tr>
                </thead>
                <tbody>
                  {currentProjectsTracking.map((project) => (
                    <tr key={project.id} className="border-b border-zinc-100">
                      <td className="px-3 py-2">
                        <Link href={`/projects/${project.id}`} className="app-link text-zinc-900">
                          {project.name}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-right text-zinc-800">
                        {project.estimatedHours && project.estimatedHours > 0 ? `${project.estimatedHours}h` : "-"}
                      </td>
                      <td className="px-3 py-2 text-right text-zinc-800">{project.actualHours}h</td>
                      <td className="px-3 py-2 text-zinc-800">{formatProjectDate(project.startDate)}</td>
                      <td className="px-3 py-2 text-zinc-800">{formatProjectDate(project.endDate)}</td>
                      <td className="px-3 py-2 text-right text-zinc-800">
                        {formatTrackingPercentage(
                          project.actualHours,
                          project.estimatedHours,
                          project.startDate,
                          project.endDate,
                          recentWeeklyHoursByProject[project.id] ?? []
                        )}
                      </td>
                      <td
                        className={`px-3 py-2 text-right font-medium ${getProjectHealthColour(project.health)}`}
                        title={project.healthReason}
                      >
                        {getProjectHealthLabel(project.health)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-600">
              No active projects yet.
            </p>
          )}
        </div>
      )}

      {/* Weekly utilisation trend */}
      <div className="app-card p-4">
        <h2 className="mb-1 font-semibold text-zinc-900">Utilisation trend (last 30 days)</h2>
        <p className="mb-4 text-sm text-zinc-600">
          Billable hours as a percentage of total team capacity, week by week.
        </p>
        <WeeklyTrendChart
          timeEntries={timeEntries.map((e) => ({
            staff_id: e.staff_id,
            date: e.date,
            hours: Number(e.hours),
            billable_flag: e.billable_flag,
          }))}
          staffProfiles={staffProfiles.map((sp) => ({
            id: sp.id,
            weekly_capacity_hours: Number(sp.weekly_capacity_hours),
          }))}
        />
      </div>

      {/* Weekly Utilization */}
      <div className="app-card p-4 space-y-3">
        <h2 className="font-semibold text-zinc-900">Weekly Utilization</h2>
        <p className="text-xs text-zinc-500">Capacity vs. project hours over the next 12 weeks.</p>
        <UtilizationTable weeks={12} />
      </div>

      {/* Staffing Gaps */}
      <div className="app-card p-4 space-y-3">
        <h2 className="font-semibold text-zinc-900">Staffing Gaps</h2>
        <p className="text-xs text-zinc-500">Weeks where demand exceeds capacity and estimated additional staff needed.</p>
        <StaffingGapsTable weeks={12} />
      </div>

      {/* Upcoming Project Load */}
      <div className="app-card p-4 space-y-3">
        <h2 className="font-semibold text-zinc-900">Upcoming Project Load</h2>
        <p className="text-xs text-zinc-500">12-week forecast of project hours, capacity, utilization, and staffing gaps.</p>
        <ForecastTable weeks={12} />
      </div>

      {/* Alerts */}
      <div className="app-card p-4">
        <h2 className="mb-4 font-semibold text-zinc-900">Alerts</h2>
        <div className="space-y-2">
          {overallocated > 0 && (
            <Link
              href="/alerts"
              className="block rounded bg-amber-50 p-2 text-sm text-amber-800 hover:bg-amber-100"
            >
              {formatCountWithPercentage(overallocated, staffMetrics.length)} staff over-utilised by billable utilisation (&gt;110%)
            </Link>
          )}
          {underutilised > 0 && (
            <Link
              href="/alerts"
              className="block rounded bg-amber-50 p-2 text-sm text-amber-800 hover:bg-amber-100"
            >
              {formatCountWithPercentage(underutilised, staffMetrics.length)} staff underutilised (&lt;60%)
            </Link>
          )}
          {projectsAtRisk.map((p) => {
            const actual = actualByProject[p.id] ?? 0;
            const health = getProjectHealthStatus(actual, p.estimated_hours, p.start_date, {
              endDate: p.end_date,
              recentWeeklyHours: recentWeeklyHoursByProject[p.id] ?? [],
            });
            const healthReason = getProjectHealthReason(actual, p.estimated_hours, p.start_date, {
              endDate: p.end_date,
              recentWeeklyHours: recentWeeklyHoursByProject[p.id] ?? [],
            });
            return (
              <Link
                key={p.id}
                href={`/projects/${p.id}`}
                className={`block rounded p-2 text-sm ${health === "overrun" ? "bg-red-50 text-red-800 hover:bg-red-100" : "bg-amber-50 text-amber-800 hover:bg-amber-100"}`}
                title={healthReason}
              >
                Project &quot;{p.name}&quot; {getProjectHealthLabel(health)}: {healthReason}
              </Link>
            );
          })}
          {overallocated === 0 && underutilised === 0 && projectsAtRisk.length === 0 && (
            <p className="text-sm text-zinc-600">No alerts</p>
          )}
        </div>
      </div>
    </div>
  );
}
