import type { ForecastWeek, HiringRecommendation } from "./types";

interface Props {
  weeks: ForecastWeek[];
  hiringRecommendations: HiringRecommendation[];
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

function StaffingRisksSection({ weeks }: { weeks: ForecastWeek[] }) {
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
                  {risk.staffing_gap.toFixed(0)}h gap
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
        Top Hiring Recommendations
      </h3>
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
      const displayName =
        entry.type === "leave" ? entry.staff : entry.name;
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

function ForecastDriversSection({ weeks }: { weeks: ForecastWeek[] }) {
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

// ── Main Component ────────────────────────────────────────────────────────────

export function DashboardActionPanel({ weeks, hiringRecommendations }: Props) {
  return (
    <div className="app-card flex h-full flex-col divide-y divide-zinc-100 p-4">
      <div className="pb-4">
        <StaffingRisksSection weeks={weeks} />
      </div>
      <div className="py-4">
        <HiringRecommendationsSection recommendations={hiringRecommendations} />
      </div>
      <div className="pt-4">
        <ForecastDriversSection weeks={weeks} />
      </div>
    </div>
  );
}
