import type { WeightDashboard } from "../types/domain.js";
import { getWeightChart, getWeightSummary, listWeightRecords } from "../repositories/weightRepository.js";
import { addDays, todayISO } from "../utils/date.js";
import { roundNumber } from "../utils/mappers.js";

type RangeType = "week" | "month" | "custom";

function rangeToDates(rangeType: RangeType, startDate?: string, endDate?: string) {
  const end = endDate ?? todayISO();
  if (startDate) return { startDate, endDate: end, rangeType: "custom" as const };
  if (rangeType === "month") return { startDate: addDays(end, -29), endDate: end, rangeType };
  return { startDate: addDays(end, -6), endDate: end, rangeType: "week" as const };
}

export async function getWeightDashboard(
  userId: number,
  input: { rangeType?: RangeType; startDate?: string; endDate?: string } = {},
): Promise<WeightDashboard> {
  const range = rangeToDates(input.rangeType ?? "week", input.startDate, input.endDate);
  const records = await listWeightRecords(userId, { startDate: range.startDate, endDate: range.endDate });
  const chronological = records.slice().reverse();
  const first = chronological[0];
  const latest = chronological.at(-1);
  const averageChangeKg =
    first && latest && chronological.length > 1 ? roundNumber((latest.weightKg - first.weightKg) / (chronological.length - 1), 2) : null;
  const direction = averageChangeKg === null ? "none" : Math.abs(averageChangeKg) < 0.05 ? "flat" : averageChangeKg > 0 ? "up" : "down";

  return {
    summary: await getWeightSummary(userId),
    range,
    records,
    chart: await getWeightChart(userId, { startDate: range.startDate, endDate: range.endDate }),
    trend: {
      recordCount: records.length,
      latestRecordedAt: latest?.measuredAt ?? null,
      averageChangeKg,
      direction,
    },
  };
}
