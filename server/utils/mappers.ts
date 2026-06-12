export function parseJsonArray<T>(value: string | T[] | null | undefined, fallback: T[] = []) {
  if (!value) return fallback;
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as T[]) : fallback;
  } catch {
    return fallback;
  }
}

export function roundNumber(value: number, fractionDigits = 1) {
  return Number(value.toFixed(fractionDigits));
}

export function sumBy<T>(items: T[], selector: (item: T) => number) {
  return items.reduce((sum, item) => sum + selector(item), 0);
}
