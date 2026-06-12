import { currentTimestampSql, getDb } from "../database/connection.js";
import type { Food, MealLog, MealType, NutritionSummary, PeriodMealSummary } from "../types/domain.js";
import { asEndOfDay, asStartOfDay, dateFromTimestamp, enumerateDates } from "../utils/date.js";
import { roundNumber, sumBy } from "../utils/mappers.js";
import { getFood } from "./foodRepository.js";
import { getProfile } from "./profileRepository.js";

type MealLogRow = {
  food_log_id: number;
  consumed_at: string;
  meal_type: MealType;
  quantity_g: number | null;
  quantity_label: string | null;
  spent_money_krw: number;
  source_type: "manual" | "recommendation" | "manual_custom";
  food_id: number | null;
  user_food_entry_id: number | null;
  food_name: string;
  food_unit_type: string;
  meal_channel: any;
  category: string | null;
  price_krw: number;
  calories_kcal: number;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
};

async function ensureDailyLog(userId: number, date: string) {
  const profile = await getProfile(userId);
  await getDb().run(
    `
      INSERT INTO daily_logs (user_id, log_date, target_calories_kcal)
      VALUES (?, ?, ?)
      ON CONFLICT(user_id, log_date) DO NOTHING
    `,
    [userId, date, profile?.targetCaloriesKcal ?? null],
  );

  const row = await getDb().get<{ id: number }>("SELECT daily_log_id AS id FROM daily_logs WHERE user_id = ? AND log_date = ?", [userId, date]);
  if (!row) throw new Error("일별 로그를 생성하지 못했습니다.");
  return row.id;
}

export async function syncDailyLogTotals(userId: number, date: string) {
  const db = getDb();
  const consumedDatePredicate = db.dialect === "postgres" ? "DATE(fl.consumed_at) = ?" : "substr(fl.consumed_at, 1, 10) = ?";
  const row = await getDb().get<{ calories: number; spent: number }>(
    `
      SELECT
        COALESCE(SUM(COALESCE(f.calories_kcal, ufe.calories_kcal)), 0) AS calories,
        COALESCE(SUM(fl.spent_money_krw), 0) AS spent
      FROM food_logs fl
      LEFT JOIN foods f ON f.food_id = fl.food_id
      LEFT JOIN user_food_entries ufe ON ufe.user_food_entry_id = fl.user_food_entry_id
      WHERE fl.user_id = ?
        AND fl.deleted_at IS NULL
        AND ${consumedDatePredicate}
    `,
    [userId, date],
  );

  await getDb().run(
    `
      UPDATE daily_logs
      SET total_calories_in_kcal = ?, total_spent_krw = ?, updated_at = ${currentTimestampSql()}
      WHERE user_id = ? AND log_date = ?
    `,
    [row?.calories ?? 0, row?.spent ?? 0, userId, date],
  );
}

async function mapMealLog(row: MealLogRow): Promise<MealLog> {
  const catalogFood = row.food_id ? await getFood(row.food_id) : null;
  const food: Food = catalogFood ?? {
    id: row.food_id ?? 0,
    name: row.food_name,
    unitType: row.food_unit_type,
    mealChannel: row.meal_channel,
    category: row.category,
    priceKrw: row.price_krw,
    caloriesKcal: row.calories_kcal,
    proteinG: row.protein_g,
    fatG: row.fat_g,
    carbsG: row.carbs_g,
    tags: [],
    allergens: [],
  };
  return {
    id: row.food_log_id,
    userFoodEntryId: row.user_food_entry_id,
    consumedAt: row.consumed_at,
    date: dateFromTimestamp(row.consumed_at),
    mealType: row.meal_type,
    food,
    quantityLabel: row.quantity_label ?? "1인분",
    quantityG: row.quantity_g,
    spentMoneyKrw: row.spent_money_krw,
    caloriesKcal: row.calories_kcal,
    proteinG: row.protein_g,
    fatG: row.fat_g,
    carbsG: row.carbs_g,
    sourceType: row.source_type,
  };
}

async function resolveRecommendationCandidateId(userId: number, recommendationCandidateId?: number | null) {
  if (!recommendationCandidateId) return null;

  const direct = await getDb().get<{ id: number }>(
    `
      SELECT rc.recommendation_candidate_id AS id
      FROM recommendation_candidates rc
      JOIN recommendation_runs rr ON rr.run_id = rc.run_id
      WHERE rr.user_id = ? AND rc.recommendation_candidate_id = ?
      LIMIT 1
    `,
    [userId, recommendationCandidateId],
  );
  if (direct) return direct.id;

  const latestByCandidate = await getDb().get<{ id: number }>(
    `
      SELECT rc.recommendation_candidate_id AS id
      FROM recommendation_candidates rc
      JOIN recommendation_runs rr ON rr.run_id = rc.run_id
      WHERE rr.user_id = ? AND rc.candidate_id = ?
      ORDER BY rc.created_at DESC
      LIMIT 1
    `,
    [userId, recommendationCandidateId],
  );
  return latestByCandidate?.id ?? null;
}

export async function listMealLogs(
  userId: number,
  filters: {
    date?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
  } = {},
) {
  const clauses = ["fl.user_id = ?", "fl.deleted_at IS NULL"];
  const params: Array<string | number | null> = [userId];

  if (filters.date) {
    clauses.push("fl.consumed_at >= ?", "fl.consumed_at <= ?");
    params.push(asStartOfDay(filters.date), asEndOfDay(filters.date));
  } else {
    if (filters.startDate) {
      clauses.push("fl.consumed_at >= ?");
      params.push(asStartOfDay(filters.startDate));
    }
    if (filters.endDate) {
      clauses.push("fl.consumed_at <= ?");
      params.push(asEndOfDay(filters.endDate));
    }
  }

  const limit = filters.limit ? `LIMIT ${Number(filters.limit)}` : "";
  const rows = await getDb().all<MealLogRow>(
    `
      SELECT
        fl.food_log_id,
        fl.consumed_at,
        fl.meal_type,
        fl.quantity_g,
        fl.quantity_label,
        fl.spent_money_krw,
        fl.source_type,
        f.food_id,
        fl.user_food_entry_id,
        COALESCE(f.food_name, ufe.food_name) AS food_name,
        COALESCE(f.food_unit_type, 'serving_menu') AS food_unit_type,
        COALESCE(f.meal_channel, 'home_meal') AS meal_channel,
        COALESCE(f.category, '직접 입력') AS category,
        COALESCE(f.price_krw, ufe.price_krw) AS price_krw,
        COALESCE(f.calories_kcal, ufe.calories_kcal) AS calories_kcal,
        COALESCE(f.protein_g, ufe.protein_g) AS protein_g,
        COALESCE(f.fat_g, ufe.fat_g) AS fat_g,
        COALESCE(f.carbs_g, ufe.carbs_g) AS carbs_g
      FROM food_logs fl
      LEFT JOIN foods f ON f.food_id = fl.food_id
      LEFT JOIN user_food_entries ufe ON ufe.user_food_entry_id = fl.user_food_entry_id
      WHERE ${clauses.join(" AND ")}
      ORDER BY fl.consumed_at DESC
      ${limit}
    `,
    params,
  );

  return Promise.all(rows.map(mapMealLog));
}

export async function getMealLog(userId: number, id: number) {
  const row = await getDb().get<MealLogRow>(
    `
      SELECT
        fl.food_log_id,
        fl.consumed_at,
        fl.meal_type,
        fl.quantity_g,
        fl.quantity_label,
        fl.spent_money_krw,
        fl.source_type,
        f.food_id,
        fl.user_food_entry_id,
        COALESCE(f.food_name, ufe.food_name) AS food_name,
        COALESCE(f.food_unit_type, 'serving_menu') AS food_unit_type,
        COALESCE(f.meal_channel, 'home_meal') AS meal_channel,
        COALESCE(f.category, '직접 입력') AS category,
        COALESCE(f.price_krw, ufe.price_krw) AS price_krw,
        COALESCE(f.calories_kcal, ufe.calories_kcal) AS calories_kcal,
        COALESCE(f.protein_g, ufe.protein_g) AS protein_g,
        COALESCE(f.fat_g, ufe.fat_g) AS fat_g,
        COALESCE(f.carbs_g, ufe.carbs_g) AS carbs_g
      FROM food_logs fl
      LEFT JOIN foods f ON f.food_id = fl.food_id
      LEFT JOIN user_food_entries ufe ON ufe.user_food_entry_id = fl.user_food_entry_id
      WHERE fl.user_id = ? AND fl.food_log_id = ? AND fl.deleted_at IS NULL
    `,
    [userId, id],
  );
  return row ? mapMealLog(row) : null;
}

async function createUserFoodEntry(
  userId: number,
  input: {
    foodName: string;
    mealType: MealType;
    quantityG?: number | null;
    quantityLabel?: string | null;
    spentMoneyKrw?: number;
    caloriesKcal: number;
    proteinG?: number;
    fatG?: number;
    carbsG?: number;
  },
) {
  const db = getDb();
  const result = await db.run(
    `
      INSERT INTO user_food_entries (
        user_id, food_name, meal_type, quantity_g, quantity_label,
        price_krw, calories_kcal, protein_g, fat_g, carbs_g
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ${db.dialect === "postgres" ? "RETURNING user_food_entry_id" : ""}
    `,
    [
      userId,
      input.foodName,
      input.mealType,
      input.quantityG ?? null,
      input.quantityLabel ?? "1인분",
      input.spentMoneyKrw ?? 0,
      input.caloriesKcal,
      input.proteinG ?? 0,
      input.fatG ?? 0,
      input.carbsG ?? 0,
    ],
  );
  if (!result.lastInsertRowid) throw new Error("직접 입력 음식 정보를 저장하지 못했습니다.");
  return result.lastInsertRowid;
}

export async function createMealLog(
  userId: number,
  input: {
    foodId?: number;
    foodName?: string;
    mealType: MealType;
    consumedAt: string;
    quantityG?: number | null;
    quantityLabel?: string | null;
    spentMoneyKrw?: number;
    caloriesKcal?: number;
    proteinG?: number;
    fatG?: number;
    carbsG?: number;
    sourceType?: "manual" | "manual_custom" | "recommendation";
    recommendationCandidateId?: number | null;
  },
) {
  const date = dateFromTimestamp(input.consumedAt);
  const dailyLogId = await ensureDailyLog(userId, date);
  const food = input.foodId ? await getFood(input.foodId) : null;
  let userFoodEntryId: number | null = null;

  if (input.foodId && !food) throw new Error("음식 정보를 찾을 수 없습니다.");

  if (!input.foodId) {
    if (!input.foodName || input.caloriesKcal === undefined) {
      throw new Error("foodId 또는 직접 입력 음식 정보가 필요합니다.");
    }
    userFoodEntryId = await createUserFoodEntry(userId, {
      foodName: input.foodName,
      mealType: input.mealType,
      quantityG: input.quantityG,
      quantityLabel: input.quantityLabel,
      spentMoneyKrw: input.spentMoneyKrw,
      caloriesKcal: input.caloriesKcal,
      proteinG: input.proteinG,
      fatG: input.fatG,
      carbsG: input.carbsG,
    });
  }

  const recommendationCandidateId = await resolveRecommendationCandidateId(userId, input.recommendationCandidateId);
  if (input.sourceType === "recommendation" && !recommendationCandidateId) {
    throw new Error("유효한 추천 기록을 찾을 수 없습니다.");
  }
  if (recommendationCandidateId && !food) {
    throw new Error("추천 식단 기록에는 공용 음식 ID가 필요합니다.");
  }
  const sourceType = recommendationCandidateId ? "recommendation" : userFoodEntryId ? "manual_custom" : "manual";

  const db = getDb();
  const result = await db.run(
    `
      INSERT INTO food_logs (
        daily_log_id, user_id, food_id, user_food_entry_id, recommendation_candidate_id, meal_type, quantity_g, quantity_label,
        spent_money_krw, consumed_at, source_type
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ${db.dialect === "postgres" ? "RETURNING food_log_id" : ""}
    `,
    [
      dailyLogId,
      userId,
      food?.id ?? null,
      userFoodEntryId,
      recommendationCandidateId,
      input.mealType,
      input.quantityG ?? null,
      input.quantityLabel ?? "1인분",
      input.spentMoneyKrw ?? food?.priceKrw ?? 0,
      input.consumedAt,
      sourceType,
    ],
  );

  await syncDailyLogTotals(userId, date);
  return result.lastInsertRowid ? getMealLog(userId, result.lastInsertRowid) : null;
}

export async function updateMealLog(
  userId: number,
  id: number,
  input: {
    foodId?: number;
    mealType?: MealType;
    consumedAt?: string;
    quantityG?: number | null;
    quantityLabel?: string | null;
    spentMoneyKrw?: number;
  },
) {
  const current = await getMealLog(userId, id);
  if (!current) return null;
  const nextConsumedAt = input.consumedAt ?? current.consumedAt;
  const nextFood = input.foodId ? await getFood(input.foodId) : null;
  if (input.foodId && !nextFood) throw new Error("음식 정보를 찾을 수 없습니다.");

  await getDb().run(
    `
      UPDATE food_logs
      SET food_id = CASE WHEN ? IS NULL THEN food_id ELSE ? END,
          user_food_entry_id = CASE WHEN ? IS NULL THEN user_food_entry_id ELSE NULL END,
          source_type = CASE WHEN ? IS NULL THEN source_type ELSE 'manual' END,
          meal_type = ?,
          consumed_at = ?,
          quantity_g = ?,
          quantity_label = ?,
          spent_money_krw = ?,
          updated_at = ${currentTimestampSql()}
      WHERE user_id = ? AND food_log_id = ?
    `,
    [
      input.foodId ?? null,
      nextFood?.id ?? null,
      input.foodId ?? null,
      input.foodId ?? null,
      input.mealType ?? current.mealType,
      nextConsumedAt,
      input.quantityG === undefined ? current.quantityG : input.quantityG,
      input.quantityLabel === undefined ? current.quantityLabel : input.quantityLabel,
      input.spentMoneyKrw ?? current.spentMoneyKrw,
      userId,
      id,
    ],
  );

  await syncDailyLogTotals(userId, current.date);
  await syncDailyLogTotals(userId, dateFromTimestamp(nextConsumedAt));
  return getMealLog(userId, id);
}

export async function deleteMealLog(userId: number, id: number) {
  const current = await getMealLog(userId, id);
  if (!current) return false;
  const result = await getDb().run(`UPDATE food_logs SET deleted_at = ${currentTimestampSql()} WHERE user_id = ? AND food_log_id = ?`, [userId, id]);
  await syncDailyLogTotals(userId, current.date);
  return result.changes > 0;
}

export function summarizeMeals(meals: MealLog[]): NutritionSummary {
  return {
    caloriesKcal: roundNumber(sumBy(meals, (meal) => meal.caloriesKcal), 0),
    proteinG: roundNumber(sumBy(meals, (meal) => meal.proteinG), 1),
    fatG: roundNumber(sumBy(meals, (meal) => meal.fatG), 1),
    carbsG: roundNumber(sumBy(meals, (meal) => meal.carbsG), 1),
    spentMoneyKrw: roundNumber(sumBy(meals, (meal) => meal.spentMoneyKrw), 0),
    mealCount: meals.length,
  };
}

export async function getPeriodMealSummary(userId: number, startDate: string, endDate: string): Promise<PeriodMealSummary> {
  const meals = (await listMealLogs(userId, { startDate, endDate })).reverse();
  const dates = enumerateDates(startDate, endDate);
  const byDate = dates.map((date) => {
    const dateMeals = meals.filter((meal) => meal.date === date);
    return {
      date,
      summary: summarizeMeals(dateMeals),
      meals: dateMeals,
    };
  });

  const mealTypeCounts = meals.reduce<Record<string, number>>((acc, meal) => {
    acc[meal.mealType] = (acc[meal.mealType] ?? 0) + 1;
    return acc;
  }, {});

  const mostFrequentMealType = Object.entries(mealTypeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] as MealType | undefined;
  const summary = summarizeMeals(meals);
  const dayCount = dates.length || 1;

  return {
    ...summary,
    startDate,
    endDate,
    byDate,
    pattern: {
      mostFrequentMealType: mostFrequentMealType ?? null,
      averageCaloriesPerDay: roundNumber(summary.caloriesKcal / dayCount, 0),
      averageSpendPerDay: roundNumber(summary.spentMoneyKrw / dayCount, 0),
    },
  };
}
