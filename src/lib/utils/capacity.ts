/**
 * Capacity calculation: weekly_capacity_hours - leave_hours - allocated_hours
 *
 * For a given period:
 * - capacity = sum of (weekly_capacity_hours * weeks in period)
 * - leave_hours = hours of approved leave in period
 * - allocated_hours = sum of (allocation_percentage/100 * capacity) per project
 *
 * Free capacity = capacity - leave - allocated
 * (Can be negative for overload)
 */

export interface CapacityInput {
  weeklyCapacityHours: number;
  leaveHours: number;
  allocatedHours: number;
}

export function calculateFreeCapacity(input: CapacityInput): number {
  return input.weeklyCapacityHours - input.leaveHours - input.allocatedHours;
}

/**
 * Get capacity hours for a date range (e.g. 30 days)
 * Assumes capacity is prorated by week (e.g. 40h/week = ~40/7 * 30 for 30 days)
 */
export function getCapacityHoursForPeriod(
  weeklyCapacityHours: number,
  startDate: Date,
  endDate: Date
): number {
  const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  const weeks = days / 7;
  return weeklyCapacityHours * weeks;
}
