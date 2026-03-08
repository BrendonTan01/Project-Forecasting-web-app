export function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function toUtcDate(dateString: string): Date {
  return new Date(`${dateString}T00:00:00Z`);
}

export function addUtcDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function startOfCurrentWeekUtc(now: Date = new Date()): Date {
  const date = new Date(now);
  date.setUTCHours(0, 0, 0, 0);
  const day = date.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + diff);
  return date;
}

export function toWeekMonday(dateString: string): string {
  const date = toUtcDate(dateString);
  const day = date.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + diff);
  return toDateString(date);
}

export function weekEndFromWeekStart(weekStart: string): string {
  return toDateString(addUtcDays(toUtcDate(weekStart), 6));
}

export function buildWeekStarts(weekMonday: Date, weeks: number): string[] {
  const starts: string[] = [];
  for (let i = 0; i < weeks; i++) {
    starts.push(toDateString(addUtcDays(weekMonday, i * 7)));
  }
  return starts;
}

export function rangesOverlap(
  rangeStart: string,
  rangeEnd: string,
  windowStart: string,
  windowEnd: string
): boolean {
  return rangeStart <= windowEnd && rangeEnd >= windowStart;
}

