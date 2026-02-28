import test from "node:test";
import assert from "node:assert/strict";
import { allocateForMode, type StaffCapacitySlice } from "../src/app/(dashboard)/proposals/feasibility-optimizer";
import type { ProposalOptimizationMode } from "../src/app/(dashboard)/proposals/optimization-modes";

const basePool: StaffCapacitySlice[] = [
  { id: "a", officeId: "office-1", freeAt100: 40, freeAtCap: 50, effectiveCapacity: 40, committedHours: 0 },
  { id: "b", officeId: "office-1", freeAt100: 20, freeAtCap: 30, effectiveCapacity: 20, committedHours: 0 },
  { id: "c", officeId: "office-2", freeAt100: 30, freeAtCap: 30, effectiveCapacity: 30, committedHours: 0 },
];

test("max_feasibility fills demand with highest room first", () => {
  const result = allocateForMode("max_feasibility", basePool, 45, true);
  assert.equal(result.achievableHours, 45);
  assert.equal(result.allocatedStaffCount, 1);
  assert.deepEqual(result.allocatedStaffIds.sort(), ["a"]);
});

test("min_staff_count behaves deterministically on same fixture", () => {
  const result = allocateForMode("min_staff_count", basePool, 45, true);
  assert.equal(result.achievableHours, 45);
  assert.equal(result.allocatedStaffCount, 1);
  assert.deepEqual(result.allocatedStaffIds.sort(), ["a"]);
});

test("single_office_preferred prioritizes one office before spillover", () => {
  const result = allocateForMode("single_office_preferred", basePool, 60, true);
  assert.equal(result.achievableHours, 60);
  assert.deepEqual(result.allocatedStaffIds.sort(), ["a", "b"]);
});

test("multi_office_balanced spreads allocation across offices", () => {
  const result = allocateForMode("multi_office_balanced", basePool, 45, true);
  assert.equal(result.achievableHours, 45);
  assert.equal(result.allocatedStaffCount, 2);
  assert.deepEqual(result.allocatedStaffIds.sort(), ["a", "c"]);
});

test("min_overallocation reduces overallocated hours vs max feasibility", () => {
  const baseline = allocateForMode("max_feasibility", basePool, 105, true);
  const optimized = allocateForMode("min_overallocation", basePool, 105, true);

  assert.equal(baseline.achievableHours, 105);
  assert.equal(optimized.achievableHours, 105);
  assert.equal(baseline.overallocatedHours, 20);
  assert.equal(optimized.overallocatedHours, 15);
});

test("worst_week_robust follows conservative overalloc profile", () => {
  const robust = allocateForMode("worst_week_robust", basePool, 105, true);
  assert.equal(robust.achievableHours, 105);
  assert.equal(robust.overallocatedHours, 15);
});

test("every optimization mode is executable on fixture", () => {
  const modes: ProposalOptimizationMode[] = [
    "max_feasibility",
    "min_staff_count",
    "single_office_preferred",
    "multi_office_balanced",
    "min_overallocation",
    "worst_week_robust",
  ];

  for (const mode of modes) {
    const result = allocateForMode(mode, basePool, 30, true);
    assert.ok(result.achievableHours > 0);
  }
});
