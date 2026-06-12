import { getDb } from "../database/connection.js";
import type { WeightRecord, WeightSummary } from "../types/domain.js";
import { asEndOfDay, asStartOfDay, dateFromTimestamp } from "../utils/date.js";
import { roundNumber } from "../utils/mappers.js";
import { getProfile } from "./profileRepository.js";

type WeightRow = {
  measurement_id: number;
  measured_at: string;
  weight_kg: number;
  height_cm: number | null;
  body_fat_percent: number | null;
  skeletal_muscle_kg: number | null;
  source: string;
  note: string | null;
};

function mapWeight(row: WeightRow): WeightRecord {
  return {
    id: row.measurement_id,
    measuredAt: row.measured_at,
    date: dateFromTimestamp(row.measured_at),
    weightKg: row.weight_kg,
    heightCm: row.height_cm,
    bodyFatPercent: row.body_fat_percent,
    skeletalMuscleKg: row.skeletal_muscle_kg,
    source: row.source,
    note: row.note,
  };
}

export async function listWeightRecords(userId: number, filters: { startDate?: string; endDate?: string } = {}) {
  const clauses = ["user_id = ?"];
  const params: Array<string | number | null> = [userId];
  if (filters.startDate) {
    clauses.push("measured_at >= ?");
    params.push(asStartOfDay(filters.startDate));
  }
  if (filters.endDate) {
    clauses.push("measured_at <= ?");
    params.push(asEndOfDay(filters.endDate));
  }

  const rows = await getDb().all<WeightRow>(
    `
      SELECT *
      FROM body_measurements
      WHERE ${clauses.join(" AND ")}
      ORDER BY measured_at DESC
    `,
    params,
  );
  return rows.map(mapWeight);
}

export async function createWeightRecord(
  userId: number,
  input: {
    measuredAt: string;
    weightKg: number;
    heightCm?: number;
    bodyFatPercent?: number;
    skeletalMuscleKg?: number;
    note?: string;
  },
) {
  const db = getDb();
  const result = await db.run(
    `
      INSERT INTO body_measurements (
        user_id, measured_at, weight_kg, height_cm, body_fat_percent,
        skeletal_muscle_kg, source, note
      )
      VALUES (?, ?, ?, ?, ?, ?, 'manual', ?)
      ON CONFLICT(user_id, measured_at) DO UPDATE SET
        weight_kg = excluded.weight_kg,
        height_cm = excluded.height_cm,
        body_fat_percent = excluded.body_fat_percent,
        skeletal_muscle_kg = excluded.skeletal_muscle_kg,
        note = excluded.note
      ${db.dialect === "postgres" ? "RETURNING measurement_id" : ""}
    `,
    [
      userId,
      input.measuredAt,
      input.weightKg,
      input.heightCm ?? null,
      input.bodyFatPercent ?? null,
      input.skeletalMuscleKg ?? null,
      input.note ?? null,
    ],
  );
  return result.lastInsertRowid ? getWeightRecord(userId, result.lastInsertRowid) : null;
}

export async function getWeightRecord(userId: number, id: number) {
  const row = await getDb().get<WeightRow>("SELECT * FROM body_measurements WHERE user_id = ? AND measurement_id = ?", [userId, id]);
  return row ? mapWeight(row) : null;
}

export async function updateWeightRecord(
  userId: number,
  id: number,
  input: {
    measuredAt?: string;
    weightKg?: number;
    heightCm?: number | null;
    bodyFatPercent?: number | null;
    skeletalMuscleKg?: number | null;
    note?: string | null;
  },
) {
  const current = await getWeightRecord(userId, id);
  if (!current) return null;
  await getDb().run(
    `
      UPDATE body_measurements
      SET measured_at = ?,
          weight_kg = ?,
          height_cm = ?,
          body_fat_percent = ?,
          skeletal_muscle_kg = ?,
          note = ?
      WHERE user_id = ? AND measurement_id = ?
    `,
    [
      input.measuredAt ?? current.measuredAt,
      input.weightKg ?? current.weightKg,
      input.heightCm === undefined ? current.heightCm : input.heightCm,
      input.bodyFatPercent === undefined ? current.bodyFatPercent : input.bodyFatPercent,
      input.skeletalMuscleKg === undefined ? current.skeletalMuscleKg : input.skeletalMuscleKg,
      input.note === undefined ? current.note : input.note,
      userId,
      id,
    ],
  );
  return getWeightRecord(userId, id);
}

export async function deleteWeightRecord(userId: number, id: number) {
  const result = await getDb().run("DELETE FROM body_measurements WHERE user_id = ? AND measurement_id = ?", [userId, id]);
  return result.changes > 0;
}

export async function getWeightSummary(userId: number): Promise<WeightSummary> {
  const profile = await getProfile(userId);
  const records = (await listWeightRecords(userId)).reverse();
  const first = records[0];
  const latest = records.at(-1);
  const previous = records.length > 1 ? records.at(-2) : null;

  if (!profile || !latest || !first) {
    return {
      currentWeightKg: 0,
      targetWeightKg: 0,
      startWeightKg: 0,
      previousWeightKg: null,
      changeFromPreviousKg: null,
      changeFromStartKg: 0,
      progressRate: 0,
      latestRecordedAt: null,
    };
  }

  const totalDelta = profile.targetWeightKg - first.weightKg;
  const currentDelta = latest.weightKg - first.weightKg;
  const progressRate = totalDelta === 0 ? 100 : Math.max(0, Math.min(100, (currentDelta / totalDelta) * 100));

  return {
    currentWeightKg: latest.weightKg,
    targetWeightKg: profile.targetWeightKg,
    startWeightKg: first.weightKg,
    previousWeightKg: previous?.weightKg ?? null,
    changeFromPreviousKg: previous ? roundNumber(latest.weightKg - previous.weightKg, 1) : null,
    changeFromStartKg: roundNumber(latest.weightKg - first.weightKg, 1),
    progressRate: roundNumber(progressRate, 0),
    latestRecordedAt: latest.measuredAt,
  };
}

export async function getWeightChart(userId: number, filters: { startDate?: string; endDate?: string } = {}) {
  const latestByDate = new Map<string, WeightRecord>();
  (await listWeightRecords(userId, filters)).forEach((record) => {
    if (!latestByDate.has(record.date)) latestByDate.set(record.date, record);
  });

  return [...latestByDate.values()].reverse().map((record) => ({
    date: record.date,
    weightKg: record.weightKg,
  }));
}
