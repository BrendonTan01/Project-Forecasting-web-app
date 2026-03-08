/**
 * WeeklyTrendChart — server component.
 * Renders a pure-CSS bar chart of week-over-week billable utilisation
 * using time_entries data that is already fetched in the dashboard.
 *
 * No charting library required.
 */

type TimeEntry = {
  staff_id: string;
  date: string;
  hours: number;
  billable_flag: boolean;
};

type StaffProfile = {
  id: string;
  weekly_capacity_hours: number;
};

type WeekBucket = {
  label: string;       // "Jan 6"
  weekStart: string;   // ISO date
  billable: number;
  total: number;
  capacity: number;
  utilisationPct: number;
};

function getMonday(dateStr: string): string {
  const d = new Date(dateStr);
  const day = d.getDay(); // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().split("T")[0];
}

function formatWeekLabel(isoDate: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(
    new Date(isoDate)
  );
}

export default function WeeklyTrendChart({
  timeEntries,
  staffProfiles,
}: {
  timeEntries: TimeEntry[];
  staffProfiles: StaffProfile[];
}) {
  // Total weekly capacity across all staff
  const totalWeeklyCapacity = staffProfiles.reduce(
    (sum, sp) => sum + Number(sp.weekly_capacity_hours),
    0
  );

  if (totalWeeklyCapacity === 0 || timeEntries.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        Not enough data to display utilisation trend.
      </p>
    );
  }

  // Bucket time entries by week (Monday as start)
  const buckets: Record<string, { billable: number; total: number }> = {};

  for (const entry of timeEntries) {
    const weekStart = getMonday(entry.date);
    if (!buckets[weekStart]) {
      buckets[weekStart] = { billable: 0, total: 0 };
    }
    buckets[weekStart].total += Number(entry.hours);
    if (entry.billable_flag) {
      buckets[weekStart].billable += Number(entry.hours);
    }
  }

  const weeks: WeekBucket[] = Object.keys(buckets)
    .sort()
    .map((weekStart) => {
      const { billable, total } = buckets[weekStart];
      const utilisationPct =
        totalWeeklyCapacity > 0 ? (billable / totalWeeklyCapacity) * 100 : 0;
      return {
        label: formatWeekLabel(weekStart),
        weekStart,
        billable,
        total,
        capacity: totalWeeklyCapacity,
        utilisationPct,
      };
    });

  if (weeks.length === 0) {
    return <p className="text-sm text-zinc-500">No time entries in this period.</p>;
  }

  const maxPct = Math.max(...weeks.map((w) => w.utilisationPct), 100);

  return (
    <div>
      {/* Bar chart */}
      <div className="flex items-end gap-1.5" style={{ height: "120px" }}>
        {weeks.map((week) => {
          const barHeightPct = Math.min((week.utilisationPct / maxPct) * 100, 100);
          const colour =
            week.utilisationPct > 110
              ? "bg-amber-400"
              : week.utilisationPct < 60
                ? "bg-zinc-300"
                : "bg-emerald-400";

          return (
            <div
              key={week.weekStart}
              className="group relative flex flex-1 flex-col items-center"
              style={{ height: "120px" }}
            >
              {/* Tooltip */}
              <div className="pointer-events-none absolute bottom-full left-1/2 mb-2 hidden w-40 -translate-x-1/2 rounded border border-zinc-200 bg-white p-2 text-xs shadow-md group-hover:block z-10">
                <p className="font-semibold text-zinc-900">w/c {week.label}</p>
                <p className="text-zinc-700">Billable: {week.billable.toFixed(1)}h</p>
                <p className="text-zinc-700">Total: {week.total.toFixed(1)}h</p>
                <p className="text-zinc-700">Utilisation: {week.utilisationPct.toFixed(1)}%</p>
              </div>

              {/* Bar */}
              <div className="flex w-full flex-1 flex-col justify-end">
                <div
                  className={`w-full rounded-t transition-all ${colour}`}
                  style={{ height: `${barHeightPct}%` }}
                />
              </div>

              {/* Label */}
              <span className="mt-1 truncate text-center text-[10px] text-zinc-500 w-full">
                {week.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-zinc-600">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm bg-emerald-400" />
          Healthy (60–110%)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm bg-amber-400" />
          Over-utilised (&gt;110%)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm bg-zinc-300" />
          Under-utilised (&lt;60%)
        </span>
      </div>

      {/* Data table */}
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left font-semibold text-zinc-700">
              <th className="pb-1">Week</th>
              <th className="pb-1 text-right">Billable</th>
              <th className="pb-1 text-right">Total</th>
              <th className="pb-1 text-right">Utilisation</th>
            </tr>
          </thead>
          <tbody>
            {weeks.map((week) => (
              <tr key={week.weekStart} className="border-b border-zinc-100">
                <td className="py-1 text-zinc-700">w/c {week.label}</td>
                <td className="py-1 text-right text-zinc-800">{week.billable.toFixed(1)}h</td>
                <td className="py-1 text-right text-zinc-800">{week.total.toFixed(1)}h</td>
                <td
                  className={`py-1 text-right font-medium ${
                    week.utilisationPct > 110
                      ? "text-amber-700"
                      : week.utilisationPct < 60
                        ? "text-zinc-500"
                        : "text-emerald-700"
                  }`}
                >
                  {week.utilisationPct.toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
