import { currentTimestampSql, getDb } from "../database/connection.js";
import type { GoalType, MealChannel, Sex, UserProfile } from "../types/domain.js";
import { parseJsonArray } from "../utils/mappers.js";

type ProfileRow = {
  user_id: number;
  email: string | null;
  display_name: string | null;
  goal_type: GoalType;
  sex: Sex;
  age_years_snapshot: number;
  height_cm: number;
  target_weight_kg: number;
  activity_level: string;
  activity_factor: number;
  energy_target_source: "calculated" | "manual";
  bmr_kcal: number;
  tdee_kcal: number;
  target_calories_kcal: number;
  target_calorie_delta_kcal: number;
  weekly_budget_krw: number;
  available_meal_channels: string | MealChannel[];
  current_weight_kg: number | null;
};

async function mapProfile(row: ProfileRow): Promise<UserProfile> {
  const [allergyRows, preferenceRows, favoriteFoodRows] = await Promise.all([
    getDb().all<{ name: string }>(
      `
        SELECT a.allergen_name AS name
        FROM user_allergens ua
        JOIN allergens a ON a.allergen_id = ua.allergen_id
        WHERE ua.user_id = ?
        ORDER BY a.allergen_name
      `,
      [row.user_id],
    ),
    getDb().all<{ type: "prefer" | "dislike" | "avoid"; value: string }>(
      `
        SELECT preference_type AS type, target_value AS value
        FROM user_preferences
        WHERE user_id = ? AND target_type = 'free_text'
        ORDER BY preference_id
      `,
      [row.user_id],
    ),
    getDb().all<{ foodId: number }>(
      `
        SELECT food_id AS "foodId"
        FROM user_preferences
        WHERE user_id = ? AND preference_type = 'prefer' AND target_type = 'food' AND food_id IS NOT NULL
        ORDER BY preference_id
      `,
      [row.user_id],
    ),
  ]);

  return {
    userId: row.user_id,
    email: row.email,
    displayName: row.display_name ?? "사용자",
    goalType: row.goal_type,
    sex: row.sex,
    ageYearsSnapshot: row.age_years_snapshot,
    heightCm: row.height_cm,
    currentWeightKg: row.current_weight_kg ?? 0,
    targetWeightKg: row.target_weight_kg,
    activityLevel: row.activity_level,
    activityFactor: row.activity_factor,
    energyTargetSource: row.energy_target_source,
    bmrKcal: row.bmr_kcal,
    tdeeKcal: row.tdee_kcal,
    targetCaloriesKcal: row.target_calories_kcal,
    targetCalorieDeltaKcal: row.target_calorie_delta_kcal,
    weeklyBudgetKrw: row.weekly_budget_krw,
    availableMealChannels: parseJsonArray<MealChannel>(row.available_meal_channels),
    allergies: allergyRows.map((item) => item.name),
    preferredFoods: preferenceRows
      .filter((item) => item.type === "prefer")
      .map((item) => item.value)
      .filter(isUserFacingPreference),
    dislikedFoods: preferenceRows.filter((item) => item.type === "dislike").map((item) => item.value),
    favoriteFoodIds: favoriteFoodRows.map((item) => item.foodId),
  };
}

function cleanList(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

const systemPreferenceValues = new Set(["균형 건강식", "체지방 감량", "근력 운동식", "키토 식단"]);

function isUserFacingPreference(value: string) {
  return !value.startsWith("channel:") && !systemPreferenceValues.has(value);
}

async function recalculateEnergyMetrics(userId: number) {
  const profile = await getProfile(userId);
  if (!profile || !profile.currentWeightKg || !profile.heightCm || !profile.ageYearsSnapshot) return;

  const baseBmr =
    10 * profile.currentWeightKg + 6.25 * profile.heightCm - 5 * profile.ageYearsSnapshot + (profile.sex === "male" ? 5 : -161);
  const bmr = Math.round(baseBmr);
  const tdee = Math.round(bmr * profile.activityFactor);

  await getDb().run(
    `
      UPDATE user_profiles
      SET bmr_kcal = ?,
          tdee_kcal = ?,
          updated_at = ${currentTimestampSql()}
      WHERE user_id = ?
    `,
    [bmr, tdee, userId],
  );
}

export async function getDefaultUserId() {
  const row = await getDb().get<{ id: number }>("SELECT user_id AS id FROM users ORDER BY user_id LIMIT 1");
  if (!row) throw new Error("기본 사용자를 찾을 수 없습니다.");
  return row.id;
}

export async function getProfile(userId?: number) {
  const effectiveUserId = userId ?? (await getDefaultUserId());
  const row = await getDb().get<ProfileRow>(
    `
      SELECT
        u.user_id,
        u.email,
        u.display_name,
        p.goal_type,
        p.sex,
        p.age_years_snapshot,
        p.height_cm,
        p.target_weight_kg,
        p.activity_level,
        p.activity_factor,
        p.energy_target_source,
        p.bmr_kcal,
        p.tdee_kcal,
        p.target_calories_kcal,
        p.target_calorie_delta_kcal,
        p.weekly_budget_krw,
        p.available_meal_channels,
        (
          SELECT weight_kg
          FROM body_measurements bm
          WHERE bm.user_id = u.user_id
          ORDER BY bm.measured_at DESC
          LIMIT 1
        ) AS current_weight_kg
      FROM users u
      JOIN user_profiles p ON p.user_id = u.user_id
      WHERE u.user_id = ?
    `,
    [effectiveUserId],
  );

  if (!row) return null;
  return mapProfile(row);
}

export async function updateGoal(
  userId: number,
  input: {
    goalType: GoalType;
    targetWeightKg: number;
    targetCaloriesKcal: number;
    targetCalorieDeltaKcal: number;
    weeklyBudgetKrw: number;
  },
) {
  await getDb().run(
    `
      UPDATE user_profiles
      SET goal_type = ?,
          target_weight_kg = ?,
          target_calories_kcal = ?,
          target_calorie_delta_kcal = ?,
          weekly_budget_krw = ?,
          updated_at = ${currentTimestampSql()}
      WHERE user_id = ?
    `,
    [input.goalType, input.targetWeightKg, input.targetCaloriesKcal, input.targetCalorieDeltaKcal, input.weeklyBudgetKrw, userId],
  );
  return getProfile(userId);
}

export async function updateProfileBasics(userId: number, input: { displayName: string; email?: string | null }) {
  await getDb().run(
    `
      UPDATE users
      SET display_name = ?,
          email = ?,
          updated_at = ${currentTimestampSql()}
      WHERE user_id = ?
    `,
    [input.displayName.trim(), input.email ?? null, userId],
  );
  return getProfile(userId);
}

export async function updateBudget(userId: number, weeklyBudgetKrw: number) {
  await getDb().run(
    `
      UPDATE user_profiles
      SET weekly_budget_krw = ?,
          updated_at = ${currentTimestampSql()}
      WHERE user_id = ?
    `,
    [weeklyBudgetKrw, userId],
  );
  return getProfile(userId);
}

export async function updateCalories(userId: number, targetCaloriesKcal: number) {
  const profile = await getProfile(userId);
  const targetCalorieDeltaKcal = Math.round(targetCaloriesKcal - (profile?.tdeeKcal ?? targetCaloriesKcal));

  await getDb().run(
    `
      UPDATE user_profiles
      SET target_calories_kcal = ?,
          target_calorie_delta_kcal = ?,
          energy_target_source = 'manual',
          updated_at = ${currentTimestampSql()}
      WHERE user_id = ?
    `,
    [targetCaloriesKcal, targetCalorieDeltaKcal, userId],
  );
  return getProfile(userId);
}

export async function updateBody(userId: number, input: { heightCm: number; weightKg?: number }) {
  await getDb().run(
    `
      UPDATE user_profiles
      SET height_cm = ?,
          updated_at = ${currentTimestampSql()}
      WHERE user_id = ?
    `,
    [input.heightCm, userId],
  );

  if (input.weightKg !== undefined) {
    await getDb().run(
      `
        INSERT INTO body_measurements (user_id, measured_at, weight_kg, height_cm, source, note)
        VALUES (?, ?, ?, ?, 'manual', '프로필에서 수정')
        ON CONFLICT(user_id, measured_at) DO UPDATE SET
          weight_kg = excluded.weight_kg,
          height_cm = excluded.height_cm,
          note = excluded.note
      `,
      [userId, new Date().toISOString().slice(0, 19), input.weightKg, input.heightCm],
    );
  }

  await recalculateEnergyMetrics(userId);
  return getProfile(userId);
}

export async function updateDemographics(userId: number, input: { sex?: Sex; ageYearsSnapshot?: number }) {
  const profile = await getProfile(userId);
  if (!profile) return null;

  await getDb().run(
    `
      UPDATE user_profiles
      SET sex = ?,
          age_years_snapshot = ?,
          updated_at = ${currentTimestampSql()}
      WHERE user_id = ?
    `,
    [input.sex ?? profile.sex, input.ageYearsSnapshot ?? profile.ageYearsSnapshot, userId],
  );

  await recalculateEnergyMetrics(userId);
  return getProfile(userId);
}

export async function replaceAllergies(userId: number, allergies: string[]) {
  const names = cleanList(allergies);

  await getDb().transaction(async (tx) => {
    await tx.run("DELETE FROM user_allergens WHERE user_id = ?", [userId]);
    for (const name of names) {
      await tx.run("INSERT INTO allergens (allergen_name) VALUES (?) ON CONFLICT(allergen_name) DO NOTHING", [name]);
      const row = await tx.get<{ id: number }>("SELECT allergen_id AS id FROM allergens WHERE allergen_name = ?", [name]);
      if (row) await tx.run("INSERT INTO user_allergens (user_id, allergen_id) VALUES (?, ?)", [userId, row.id]);
    }
  });

  return getProfile(userId);
}

export async function replacePreferences(userId: number, input: { preferredFoods: string[]; dislikedFoods: string[] }) {
  const preferredFoods = cleanList(input.preferredFoods);
  const dislikedFoods = cleanList(input.dislikedFoods);

  await getDb().transaction(async (tx) => {
    await tx.run("DELETE FROM user_preferences WHERE user_id = ? AND target_type = 'free_text'", [userId]);
    for (const value of preferredFoods) {
      await tx.run(
        `
          INSERT INTO user_preferences (user_id, preference_type, target_type, target_value, strength)
          VALUES (?, 'prefer', 'free_text', ?, 3)
        `,
        [userId, value],
      );
    }
    for (const value of dislikedFoods) {
      await tx.run(
        `
          INSERT INTO user_preferences (user_id, preference_type, target_type, target_value, strength)
          VALUES (?, 'dislike', 'free_text', ?, 3)
        `,
        [userId, value],
      );
    }
  });

  return getProfile(userId);
}

export async function toggleFoodFavorite(userId: number, foodId: number) {
  const existing = await getDb().get<{ id: number }>(
    `
      SELECT preference_id AS id
      FROM user_preferences
      WHERE user_id = ? AND preference_type = 'prefer' AND target_type = 'food' AND food_id = ?
      LIMIT 1
    `,
    [userId, foodId],
  );

  if (existing) {
    await getDb().run("DELETE FROM user_preferences WHERE preference_id = ?", [existing.id]);
    return { foodId, favorited: false };
  }

  await getDb().run(
    `
      INSERT INTO user_preferences (user_id, preference_type, target_type, food_id, strength)
      VALUES (?, 'prefer', 'food', ?, 5)
    `,
    [userId, foodId],
  );

  return { foodId, favorited: true };
}

export async function createUserInteraction(
  userId: number,
  input: {
    foodId?: number;
    candidateId?: number;
    interactionType: "impressed" | "clicked" | "accepted" | "rejected" | "skipped" | "logged" | "corrected" | "deleted";
    interactionWeight?: number;
    metadata?: unknown;
  },
) {
  const db = getDb();
  const metadataValue = db.dialect === "postgres" ? "?::jsonb" : "?";
  const result = await db.run(
    `
      INSERT INTO user_item_interactions (
        user_id, food_id, candidate_id, interaction_type, interaction_weight, metadata
      )
      VALUES (?, ?, ?, ?, ?, ${metadataValue})
      ${db.dialect === "postgres" ? "RETURNING interaction_id" : ""}
    `,
    [
      userId,
      input.foodId ?? null,
      input.candidateId ?? null,
      input.interactionType,
      input.interactionWeight ?? 0,
      input.metadata === undefined ? null : JSON.stringify(input.metadata),
    ],
  );

  return {
    id: result.lastInsertRowid ?? 0,
    foodId: input.foodId ?? null,
    candidateId: input.candidateId ?? null,
    interactionType: input.interactionType,
  };
}
