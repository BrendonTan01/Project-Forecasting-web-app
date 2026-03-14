import type {
  ForecastProposal,
  ForecastWeek,
  HiringRecommendation,
  SkillShortage,
} from "./types";

interface Props {
  weeks: ForecastWeek[];
  hiringRecommendations: HiringRecommendation[];
  skillShortages: SkillShortage[];
  proposals: ForecastProposal[];
  selectedProposalIds: string[];
  onSelectedProposalIdsChange: (ids: string[]) => void;
  planningHoursPerPersonPerWeek: number;
  showSkillShortages?: boolean;
  showForecastDrivers?: boolean;
}

// ── Staffing Risks ────────────────────────────────────────────────────────────

type StaffingRisk = {
  week_start: string;
  staffing_gap: number;
};

function formatWeekLabel(isoDate: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${isoDate}T00:00:00Z`));
}

function formatHours(value: number): string {
  return Number.isInteger(value) ? `${value}h` : `${value.toFixed(1)}h`;
}

function formatHoursWithPeople(value: number, planningHoursPerPersonPerWeek: number): string {
  const people = value / planningHoursPerPersonPerWeek;
  return `${formatHours(value)} (${people.toFixed(2)} people)`;
}

function toUtcDate(dateString: string): Date {
  return new Date(`${dateString}T00:00:00Z`);
}

function toWeekMonday(dateString: string): string {
  const date = toUtcDate(dateString);
  const day = date.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + diff);
  return date.toISOString().slice(0, 10);
}

function formatShortDate(isoDate: string | null): string {
  if (!isoDate) return "No start date";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${isoDate}T00:00:00Z`));
}

function countProposalWeeks(proposal: ForecastProposal): number | null {
  if (!proposal.proposed_start_date || !proposal.proposed_end_date) return null;
  const startMonday = toUtcDate(toWeekMonday(proposal.proposed_start_date));
  const endMonday = toUtcDate(toWeekMonday(proposal.proposed_end_date));
  if (endMonday < startMonday) return 1;
  const diffDays = Math.floor((endMonday.getTime() - startMonday.getTime()) / 86400000);
  return Math.floor(diffDays / 7) + 1;
}

function getProposalHoursPerWeekLabel(proposal: ForecastProposal): string {
  if (
    proposal.estimated_hours_per_week !== null &&
    proposal.estimated_hours_per_week !== undefined
  ) {
    return `${formatHours(Number(proposal.estimated_hours_per_week))}/wk`;
  }
  if (proposal.estimated_hours === null || proposal.estimated_hours === undefined) {
    return "No hrs/week";
  }
  const weekCount = countProposalWeeks(proposal);
  if (!weekCount || weekCount <= 0) {
    return "No hrs/week";
  }
  return `${formatHours(Number(proposal.estimated_hours) / weekCount)}/wk`;
}

function ProposalSelectionSection({
  proposals,
  selectedProposalIds,
  onSelectedProposalIdsChange,
}: {
  proposals: ForecastProposal[];
  selectedProposalIds: string[];
  onSelectedProposalIdsChange: (ids: string[]) => void;
}) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        Proposal Selection
      </h3>
      {proposals.length === 0 ? (
        <p className="text-xs text-zinc-400 italic">No proposals available.</p>
      ) : (
        <>
          <p className="mb-2 text-[11px] text-zinc-500">
            {selectedProposalIds.length}/{proposals.length} selected
          </p>
          <div className="space-y-1 overflow-y-auto pr-1" style={{ maxHeight: 170 }}>
            {proposals.map((proposal) => {
              const checked = selectedProposalIds.includes(proposal.id);
              return (
                <label
                  key={proposal.id}
                  className="flex items-start gap-2 rounded border border-zinc-100 px-2 py-1 text-[11px] text-zinc-700 hover:bg-zinc-50"
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 h-3.5 w-3.5 rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
                    checked={checked}
                    onChange={(event) => {
                      const nextChecked = event.target.checked;
                      if (nextChecked) {
                        if (checked) return;
                        onSelectedProposalIdsChange([...selectedProposalIds, proposal.id]);
                        return;
                      }
                      onSelectedProposalIdsChange(
                        selectedProposalIds.filter((id) => id !== proposal.id)
                      );
                    }}
                  />
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-zinc-700">
                      {proposal.name}
                    </span>
                    <span className="text-zinc-500">
                      {getProposalHoursPerWeekLabel(proposal)}
                      {" · "}
                      Start {formatShortDate(proposal.proposed_start_date)}
                      {!proposal.has_complete_dates ? " · missing dates" : ""}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function StaffingRisksSection({
  weeks,
  planningHoursPerPersonPerWeek,
}: {
  weeks: ForecastWeek[];
  planningHoursPerPersonPerWeek: number;
}) {
  const risks: StaffingRisk[] = weeks
    .filter((w) => w.staffing_gap > 0)
    .sort((a, b) => b.staffing_gap - a.staffing_gap)
    .slice(0, 5)
    .map((w) => ({ week_start: w.week_start, staffing_gap: w.staffing_gap }));

  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        Top Staffing Risks
      </h3>
      <p className="mb-2 text-[11px] text-zinc-500">
        Weeks with the largest total staffing gap across all skills.
      </p>
      {risks.length === 0 ? (
        <p className="text-xs text-zinc-400 italic">No staffing gaps in the forecast window.</p>
      ) : (
        <ul className="space-y-1.5">
          {risks.map((risk) => {
            const isCritical = risk.staffing_gap > 40;
            return (
              <li
                key={risk.week_start}
                className="flex items-center justify-between gap-2 rounded border border-zinc-100 px-3 py-1.5"
              >
                <span className="text-xs text-zinc-700">
                  w/c {formatWeekLabel(risk.week_start)}
                </span>
                <span
                  className={`app-badge ${isCritical ? "app-badge-danger" : "app-badge-warning"} shrink-0`}
                >
                  {formatHoursWithPeople(risk.staffing_gap, planningHoursPerPersonPerWeek)} gap
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ── Hiring Recommendations ────────────────────────────────────────────────────

function HiringRecommendationsSection({
  recommendations,
}: {
  recommendations: HiringRecommendation[];
}) {
  const top = [...recommendations]
    .sort((a, b) => b.staff_needed - a.staff_needed)
    .slice(0, 5);

  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        Top Hiring Recommendations (by Skill)
      </h3>
      <p className="mb-2 text-[11px] text-zinc-500">
        Suggested hires grouped by skill shortage in the forecast window.
      </p>
      {top.length === 0 ? (
        <p className="text-xs text-zinc-400 italic">No hiring recommendations at this time.</p>
      ) : (
        <ul className="space-y-1.5">
          {top.map((rec) => (
            <li
              key={rec.skill}
              className="flex items-center justify-between gap-2 rounded border border-zinc-100 px-3 py-1.5"
            >
              <span className="truncate text-xs font-medium text-zinc-800">{rec.skill}</span>
              <span className="app-badge app-badge-warning shrink-0">
                +{rec.staff_needed} hire{rec.staff_needed !== 1 ? "s" : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Skill Shortages ───────────────────────────────────────────────────────────

export function SkillShortagesSection({
  shortages,
  planningHoursPerPersonPerWeek,
}: {
  shortages: SkillShortage[];
  planningHoursPerPersonPerWeek: number;
}) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        Top Skill Shortages
      </h3>
      <p className="mb-2 text-[11px] text-zinc-500">
        People equivalent uses {planningHoursPerPersonPerWeek.toFixed(1)}h per person per week.
      </p>
      {shortages.length === 0 ? (
        <p className="text-xs text-zinc-400 italic">No skill shortages detected</p>
      ) : (
        <ul className="space-y-1.5">
          {shortages.map((shortage) => (
            <li
              key={shortage.skill}
              className="rounded border border-zinc-100 px-3 py-1.5"
            >
              <p className="truncate text-xs font-medium text-zinc-800">
                {shortage.skill}
              </p>
              <p className="mt-0.5 text-[11px] text-zinc-600 tabular-nums">
                Demand{" "}
                {formatHoursWithPeople(shortage.weekly_demand, planningHoursPerPersonPerWeek)} · Capacity{" "}
                {formatHoursWithPeople(shortage.available_capacity, planningHoursPerPersonPerWeek)} · Shortage{" "}
                {formatHoursWithPeople(shortage.shortage, planningHoursPerPersonPerWeek)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Forecast Drivers ──────────────────────────────────────────────────────────

type AggregatedDriver = {
  type: "proposal" | "leave" | "project";
  displayName: string;
  impact_hours: number;
};

function aggregateDrivers(weeks: ForecastWeek[]): AggregatedDriver[] {
  const map = new Map<string, AggregatedDriver>();
  for (const week of weeks) {
    for (const entry of week.forecast_explanation ?? []) {
      const displayName = entry.name;
      const key = `${entry.type}::${displayName}`;
      const existing = map.get(key);
      if (existing) {
        existing.impact_hours =
          Math.round((existing.impact_hours + entry.impact_hours) * 100) / 100;
      } else {
        map.set(key, {
          type: entry.type,
          displayName,
          impact_hours: Math.round(entry.impact_hours * 100) / 100,
        });
      }
    }
  }
  return Array.from(map.values())
    .sort((a, b) => Math.abs(b.impact_hours) - Math.abs(a.impact_hours))
    .slice(0, 5);
}

const DRIVER_COLORS: Record<"proposal" | "leave" | "project", string> = {
  proposal: "#1d4ed8",
  leave: "#dc2626",
  project: "#10b981",
};

export function ForecastDriversSection({ weeks }: { weeks: ForecastWeek[] }) {
  const drivers = aggregateDrivers(weeks);

  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        Top Forecast Drivers
      </h3>
      {drivers.length === 0 ? (
        <p className="text-xs text-zinc-400 italic">No explanation data available.</p>
      ) : (
        <ul className="space-y-1.5">
          {drivers.map((driver, idx) => {
            const color = DRIVER_COLORS[driver.type];
            const sign = driver.impact_hours >= 0 ? "+" : "−";
            const absHours = Math.abs(driver.impact_hours);
            return (
              <li key={idx} className="flex items-center gap-2 rounded border border-zinc-100 px-3 py-1.5">
                <span
                  className="shrink-0 text-[10px] font-semibold uppercase"
                  style={{ color }}
                >
                  {driver.type.slice(0, 4)}
                </span>
                <span className="flex-1 truncate text-xs text-zinc-700">
                  {driver.displayName}
                </span>
                <span
                  className="shrink-0 text-xs font-semibold tabular-nums"
                  style={{ color }}
                >
                  {sign}{absHours}h
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function DashboardDetailRail({
  weeks,
  skillShortages,
  planningHoursPerPersonPerWeek,
}: {
  weeks: ForecastWeek[];
  skillShortages: SkillShortage[];
  planningHoursPerPersonPerWeek: number;
}) {
  return (
    <div className="app-card p-4">
      <h3 className="mb-3 text-sm font-semibold text-zinc-700">Detail Rail</h3>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded border border-zinc-100 p-3">
          <SkillShortagesSection
            shortages={skillShortages}
            planningHoursPerPersonPerWeek={planningHoursPerPersonPerWeek}
          />
        </div>
        <div className="rounded border border-zinc-100 p-3">
          <ForecastDriversSection weeks={weeks} />
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function DashboardActionPanel({
  weeks,
  hiringRecommendations,
  skillShortages,
  proposals,
  selectedProposalIds,
  onSelectedProposalIdsChange,
  planningHoursPerPersonPerWeek,
  showSkillShortages = true,
  showForecastDrivers = true,
}: Props) {
  return (
    <div className="app-card flex h-full flex-col divide-y divide-zinc-100 p-4">
      <div className="pb-4">
        <ProposalSelectionSection
          proposals={proposals}
          selectedProposalIds={selectedProposalIds}
          onSelectedProposalIdsChange={onSelectedProposalIdsChange}
        />
      </div>
      <div className="py-4">
        <StaffingRisksSection
          weeks={weeks}
          planningHoursPerPersonPerWeek={planningHoursPerPersonPerWeek}
        />
      </div>
      <div className="py-4">
        <HiringRecommendationsSection recommendations={hiringRecommendations} />
      </div>
      {showSkillShortages && (
        <div className="py-4">
          <SkillShortagesSection
            shortages={skillShortages}
            planningHoursPerPersonPerWeek={planningHoursPerPersonPerWeek}
          />
        </div>
      )}
      {showForecastDrivers && (
        <div className="pt-4">
          <ForecastDriversSection weeks={weeks} />
        </div>
      )}
    </div>
  );
}
