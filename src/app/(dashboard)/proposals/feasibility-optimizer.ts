import type { ProposalOptimizationMode } from "./optimization-modes";

export type StaffCapacitySlice = {
  id: string;
  officeId: string | null;
  freeAt100: number;
  freeAtCap: number;
  effectiveCapacity: number;
  committedHours: number;
};

export type AllocationResult = {
  achievableHours: number;
  allocatedStaffCount: number;
  allocatedStaffIds: string[];
  overallocatedStaffIds: string[];
  overallocatedHours: number;
};

function rankGreedyCandidates(
  mode: ProposalOptimizationMode,
  pool: StaffCapacitySlice[],
  preferredOfficeId: string | null
) {
  const byBiggestRoom = (a: StaffCapacitySlice, b: StaffCapacitySlice) => b.freeAtCap - a.freeAtCap;

  switch (mode) {
    case "single_office_preferred":
      return [...pool].sort((a, b) => {
        const aPreferred = a.officeId === preferredOfficeId ? 1 : 0;
        const bPreferred = b.officeId === preferredOfficeId ? 1 : 0;
        if (aPreferred !== bPreferred) return bPreferred - aPreferred;
        return byBiggestRoom(a, b);
      });
    case "min_overallocation":
    case "worst_week_robust":
      return [...pool].sort((a, b) => {
        if (a.freeAt100 !== b.freeAt100) return b.freeAt100 - a.freeAt100;
        return byBiggestRoom(a, b);
      });
    case "min_staff_count":
    case "max_feasibility":
    default:
      return [...pool].sort(byBiggestRoom);
  }
}

function allocateBalancedAcrossOffices(
  pool: StaffCapacitySlice[],
  targetHours: number
): Record<string, number> {
  const assignedByStaff: Record<string, number> = {};
  if (targetHours <= 0 || pool.length === 0) return assignedByStaff;

  const officeGroups = new Map<string, StaffCapacitySlice[]>();
  for (const staff of pool) {
    const officeKey = staff.officeId ?? "unknown";
    const existing = officeGroups.get(officeKey) ?? [];
    existing.push(staff);
    officeGroups.set(officeKey, existing);
  }

  const offices = Array.from(officeGroups.values()).map((members) => ({
    members: members.sort((a, b) => b.freeAtCap - a.freeAtCap),
    totalRoom: members.reduce((sum, m) => sum + m.freeAtCap, 0),
  }));
  const totalRoomAll = offices.reduce((sum, o) => sum + o.totalRoom, 0);
  if (totalRoomAll <= 0) return assignedByStaff;

  let remaining = targetHours;
  for (const office of offices) {
    if (remaining <= 0) break;
    const proportionalTarget = (targetHours * office.totalRoom) / totalRoomAll;
    const officeTarget = Math.min(remaining, proportionalTarget);
    let officeRemaining = officeTarget;
    for (const staff of office.members) {
      if (officeRemaining <= 0) break;
      const take = Math.min(staff.freeAtCap, officeRemaining);
      if (take > 0) {
        assignedByStaff[staff.id] = (assignedByStaff[staff.id] ?? 0) + take;
        officeRemaining -= take;
        remaining -= take;
      }
    }
  }

  if (remaining > 0) {
    const allMembers = offices.flatMap((office) => office.members);
    for (const staff of allMembers) {
      if (remaining <= 0) break;
      const alreadyAssigned = assignedByStaff[staff.id] ?? 0;
      const roomLeft = Math.max(0, staff.freeAtCap - alreadyAssigned);
      const take = Math.min(roomLeft, remaining);
      if (take > 0) {
        assignedByStaff[staff.id] = alreadyAssigned + take;
        remaining -= take;
      }
    }
  }

  return assignedByStaff;
}

function selectPreferredOffice(staff: StaffCapacitySlice[]): string | null {
  const officeTotals = new Map<string, number>();
  for (const member of staff) {
    if (!member.officeId) continue;
    officeTotals.set(member.officeId, (officeTotals.get(member.officeId) ?? 0) + member.freeAtCap);
  }
  let winner: string | null = null;
  let best = -1;
  for (const [officeId, total] of officeTotals.entries()) {
    if (total > best) {
      best = total;
      winner = officeId;
    }
  }
  return winner;
}

export function allocateForMode(
  mode: ProposalOptimizationMode,
  pool: StaffCapacitySlice[],
  targetHours: number,
  allowOverallocation: boolean
): AllocationResult {
  let assignedByStaff: Record<string, number> = {};
  const preferredOfficeId = selectPreferredOffice(pool);

  if (mode === "multi_office_balanced") {
    assignedByStaff = allocateBalancedAcrossOffices(pool, targetHours);
  } else {
    const candidates = rankGreedyCandidates(mode, pool, preferredOfficeId);
    let remaining = targetHours;
    for (const candidate of candidates) {
      if (remaining <= 0) break;
      const capForMode =
        mode === "min_overallocation" || mode === "worst_week_robust"
          ? candidate.freeAt100 + (allowOverallocation ? Math.max(0, candidate.freeAtCap - candidate.freeAt100) * 0.5 : 0)
          : candidate.freeAtCap;
      const take = Math.min(capForMode, remaining);
      if (take > 0) {
        assignedByStaff[candidate.id] = (assignedByStaff[candidate.id] ?? 0) + take;
        remaining -= take;
      }
    }
    if (remaining > 0 && (mode === "min_overallocation" || mode === "worst_week_robust")) {
      const fallback = rankGreedyCandidates("max_feasibility", pool, preferredOfficeId);
      for (const candidate of fallback) {
        if (remaining <= 0) break;
        const already = assignedByStaff[candidate.id] ?? 0;
        const room = Math.max(0, candidate.freeAtCap - already);
        const take = Math.min(room, remaining);
        if (take > 0) {
          assignedByStaff[candidate.id] = already + take;
          remaining -= take;
        }
      }
    }
  }

  let allocatedStaffCount = 0;
  let overallocatedHours = 0;
  const overallocatedStaffIds = new Set<string>();
  const allocatedStaffIds = new Set<string>();
  let achievableHours = 0;

  for (const member of pool) {
    const assigned = assignedByStaff[member.id] ?? 0;
    achievableHours += assigned;
    if (assigned > 0) {
      allocatedStaffCount += 1;
      allocatedStaffIds.add(member.id);
    }
    const overAfterAssignment = Math.max(0, member.committedHours + assigned - member.effectiveCapacity);
    if (overAfterAssignment > 0) {
      overallocatedStaffIds.add(member.id);
      overallocatedHours += overAfterAssignment;
    }
  }

  return {
    achievableHours,
    allocatedStaffCount,
    allocatedStaffIds: Array.from(allocatedStaffIds),
    overallocatedStaffIds: Array.from(overallocatedStaffIds),
    overallocatedHours,
  };
}
