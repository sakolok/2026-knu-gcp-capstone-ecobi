const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function assertDate(value: string, fieldName = "date") {
  if (!ISO_DATE_RE.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new Error(`${fieldName} must be YYYY-MM-DD`);
  }
  return value;
}

export function dateFromTimestamp(value: string | Date) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value.slice(0, 10);
}

export function asStartOfDay(date: string) {
  assertDate(date);
  return `${date}T00:00:00`;
}

export function asEndOfDay(date: string) {
  assertDate(date);
  return `${date}T23:59:59`;
}

export function addDays(date: string, days: number) {
  assertDate(date);
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return next.toISOString().slice(0, 10);
}

export function getWeekRange(referenceDate = todayISO()) {
  assertDate(referenceDate, "referenceDate");
  const [year, month, dateOfMonth] = referenceDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, dateOfMonth));
  const day = date.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const startDate = addDays(referenceDate, mondayOffset);
  return {
    startDate,
    endDate: addDays(startDate, 6),
  };
}

export function enumerateDates(startDate: string, endDate: string) {
  assertDate(startDate, "startDate");
  assertDate(endDate, "endDate");
  const result: string[] = [];
  let cursor = startDate;
  while (cursor <= endDate) {
    result.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return result;
}
