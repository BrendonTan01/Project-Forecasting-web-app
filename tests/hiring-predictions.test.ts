import test from "node:test";
import assert from "node:assert/strict";
import { deriveHiringPredictionsFromForecast } from "../src/lib/forecast/engine";

const tenantId = "tenant-test";

test("overload recommends proportional hires", () => {
  const rows = deriveHiringPredictionsFromForecast(
    tenantId,
    [
      {
        week_start: "2026-06-01",
        utilization_rate: 1.3,
        total_capacity: 200,
        total_project_hours: 260,
      },
    ],
    40
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0].hours_over_capacity, 60);
  assert.equal(rows[0].recommended_hires, 2);
  assert.equal(rows[0].recommendation_type, "overload");
});

test("sustained utilization over 95% triggers preventive hire on week 3", () => {
  const rows = deriveHiringPredictionsFromForecast(
    tenantId,
    [
      { week_start: "2026-06-01", utilization_rate: 0.96, total_capacity: 200, total_project_hours: 192 },
      { week_start: "2026-06-08", utilization_rate: 0.97, total_capacity: 200, total_project_hours: 194 },
      { week_start: "2026-06-15", utilization_rate: 0.98, total_capacity: 200, total_project_hours: 196 },
    ],
    40
  );

  assert.equal(rows[0].recommendation_type, "none");
  assert.equal(rows[1].recommendation_type, "none");
  assert.equal(rows[2].recommendation_type, "sustained_overload");
  assert.equal(rows[2].recommended_hires, 1);
});

test("underutilization below 65% for 4 weeks triggers insight on week 4", () => {
  const rows = deriveHiringPredictionsFromForecast(
    tenantId,
    [
      { week_start: "2026-07-06", utilization_rate: 0.6, total_capacity: 200, total_project_hours: 120 },
      { week_start: "2026-07-13", utilization_rate: 0.62, total_capacity: 200, total_project_hours: 124 },
      { week_start: "2026-07-20", utilization_rate: 0.61, total_capacity: 200, total_project_hours: 122 },
      { week_start: "2026-07-27", utilization_rate: 0.63, total_capacity: 200, total_project_hours: 126 },
    ],
    40
  );

  assert.equal(rows[3].recommendation_type, "underutilization");
  assert.equal(rows[3].recommended_hires, 0);
});

test("exact thresholds do not trigger rules", () => {
  const rows = deriveHiringPredictionsFromForecast(
    tenantId,
    [
      { week_start: "2026-08-03", utilization_rate: 1.0, total_capacity: 200, total_project_hours: 200 },
      { week_start: "2026-08-10", utilization_rate: 0.95, total_capacity: 200, total_project_hours: 190 },
      { week_start: "2026-08-17", utilization_rate: 0.95, total_capacity: 200, total_project_hours: 190 },
      { week_start: "2026-08-24", utilization_rate: 0.95, total_capacity: 200, total_project_hours: 190 },
      { week_start: "2026-08-31", utilization_rate: 0.65, total_capacity: 200, total_project_hours: 130 },
      { week_start: "2026-09-07", utilization_rate: 0.65, total_capacity: 200, total_project_hours: 130 },
      { week_start: "2026-09-14", utilization_rate: 0.65, total_capacity: 200, total_project_hours: 130 },
      { week_start: "2026-09-21", utilization_rate: 0.65, total_capacity: 200, total_project_hours: 130 },
    ],
    40
  );

  for (const row of rows) {
    assert.equal(row.recommendation_type, "none");
    assert.equal(row.recommended_hires, 0);
  }
});
