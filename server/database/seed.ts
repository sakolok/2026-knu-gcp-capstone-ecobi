import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { currentTimestampSql, getDb, type DbClient } from "./connection.js";
import { runMigrations } from "./migrate.js";
import { getWeekRange } from "../utils/date.js";

type SeedFood = {
  name: string;
  unitType: string;
  mealChannel: string;
  category: string;
  quantityLabel: string;
  priceKrw: number;
  caloriesKcal: number;
  carbsG: number;
  proteinG: number;
  fatG: number;
  tags: string[];
  allergens: string[];
};

type DevSeed = {
  today: string;
  user: { loginId: string; email: string; displayName: string };
  profile: {
    goalType: string;
    sex: string;
    ageYearsSnapshot: number;
    heightCm: number;
    targetWeightKg: number;
    activityLevel: string;
    activityFactor: number;
    energyTargetSource: string;
    bmrKcal: number;
    tdeeKcal: number;
    targetCaloriesKcal: number;
    targetCalorieDeltaKcal: number;
    weeklyBudgetKrw: number;
    availableMealChannels: string[];
  };
  allergens: string[];
  userAllergens: string[];
  tags: string[];
  preferences: { prefer: string[]; dislike: string[] };
  foods: SeedFood[];
};

function loadSeed() {
  const seedPath = resolve(process.cwd(), "database/seeds/dev-seed.json");
  return JSON.parse(readFileSync(seedPath, "utf8")) as DevSeed;
}

async function getId(db: DbClient, sql: string, value: string) {
  const row = await db.get<{ id: number }>(sql, [value]);
  if (!row) throw new Error(`Seed lookup failed: ${value}`);
  return row.id;
}

async function insertLookup(db: DbClient, table: string, nameColumn: string, value: string) {
  await db.run(`INSERT INTO ${table} (${nameColumn}) VALUES (?) ON CONFLICT(${nameColumn}) DO NOTHING`, [value]);
}

async function ensureDailyLog(db: DbClient, userId: number, date: string, targetCaloriesKcal: number) {
  await db.run(
    `
      INSERT INTO daily_logs (user_id, log_date, target_calories_kcal)
      VALUES (?, ?, ?)
      ON CONFLICT(user_id, log_date) DO NOTHING
    `,
    [userId, date, targetCaloriesKcal],
  );

  const row = await db.get<{ id: number }>("SELECT daily_log_id AS id FROM daily_logs WHERE user_id = ? AND log_date = ?", [userId, date]);
  if (!row) throw new Error("Seed daily log creation failed.");
  return row.id;
}

async function syncDailyLogTotals(db: DbClient, userId: number, date: string) {
  const consumedDatePredicate = db.dialect === "postgres" ? "DATE(fl.consumed_at) = ?" : "substr(fl.consumed_at, 1, 10) = ?";
  const row = await db.get<{ calories: number; spent: number }>(
    `
      SELECT
        COALESCE(SUM(f.calories_kcal), 0) AS calories,
        COALESCE(SUM(fl.spent_money_krw), 0) AS spent
      FROM food_logs fl
      JOIN foods f ON f.food_id = fl.food_id
      WHERE fl.user_id = ?
        AND fl.deleted_at IS NULL
        AND ${consumedDatePredicate}
    `,
    [userId, date],
  );

  await db.run(
    `
      UPDATE daily_logs
      SET total_calories_in_kcal = ?, total_spent_krw = ?, updated_at = ${currentTimestampSql(db)}
      WHERE user_id = ? AND log_date = ?
    `,
    [row?.calories ?? 0, row?.spent ?? 0, userId, date],
  );
}

async function resetSeedTables(db: DbClient) {
  await db.exec(`
    DELETE FROM recovery_outcomes;
    DELETE FROM plan_revision_meals;
    DELETE FROM plan_revisions;
    DELETE FROM shock_events;
    DELETE FROM weekly_plan_meals;
    DELETE FROM user_item_interactions;
    DELETE FROM food_logs;
    DELETE FROM recommendation_candidates;
    DELETE FROM recommendation_runs;
    DELETE FROM meal_candidate_items;
    DELETE FROM meal_candidates;
    DELETE FROM daily_logs;
    DELETE FROM weekly_plans;
    DELETE FROM user_preferences;
    DELETE FROM user_allergens;
    DELETE FROM food_tag_map;
    DELETE FROM food_allergens;
    DELETE FROM foods;
    DELETE FROM tags;
    DELETE FROM allergens;
    DELETE FROM body_measurements;
    DELETE FROM user_profiles;
    DELETE FROM users;
  `);
}

export async function seedDevData({ force = false } = {}) {
  await runMigrations();
  const db = getDb();
  const existing = await db.get<{ count: number }>("SELECT COUNT(*) AS count FROM users");
  if ((existing?.count ?? 0) > 0 && !force) return false;

  if (force) {
    await resetSeedTables(db);
  }

  const seed = loadSeed();

  await db.transaction(async (tx) => {
    const availableMealChannels =
      tx.dialect === "postgres" ? seed.profile.availableMealChannels : JSON.stringify(seed.profile.availableMealChannels);

    const userResult = await tx.run(
      `
        INSERT INTO users (login_id, email, display_name, password_hash, password_salt)
        VALUES (?, ?, ?, ?, ?)
        ${tx.dialect === "postgres" ? "RETURNING user_id" : ""}
      `,
      [
        seed.user.loginId,
        seed.user.email,
        seed.user.displayName,
        "881368663fb8b1d29d4ef1be8361b7816aa30ccf564f3d5aa3e52abddcc77023",
        "ecobi-dev-salt",
      ],
    );
    const userId = Number(userResult.lastInsertRowid);

    await tx.run(
      `
        INSERT INTO user_profiles (
          user_id, goal_type, sex, age_years_snapshot, height_cm, target_weight_kg,
          activity_level, activity_factor, energy_target_source, bmr_kcal, tdee_kcal,
          target_calories_kcal, target_calorie_delta_kcal, weekly_budget_krw,
          available_meal_channels
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        userId,
        seed.profile.goalType,
        seed.profile.sex,
        seed.profile.ageYearsSnapshot,
        seed.profile.heightCm,
        seed.profile.targetWeightKg,
        seed.profile.activityLevel,
        seed.profile.activityFactor,
        seed.profile.energyTargetSource,
        seed.profile.bmrKcal,
        seed.profile.tdeeKcal,
        seed.profile.targetCaloriesKcal,
        seed.profile.targetCalorieDeltaKcal,
        seed.profile.weeklyBudgetKrw,
        availableMealChannels,
      ],
    );

    for (const allergen of seed.allergens) await insertLookup(tx, "allergens", "allergen_name", allergen);
    for (const tag of seed.tags) await insertLookup(tx, "tags", "tag_name", tag);

    for (const allergen of seed.userAllergens) {
      const allergenId = await getId(tx, "SELECT allergen_id AS id FROM allergens WHERE allergen_name = ?", allergen);
      await tx.run("INSERT INTO user_allergens (user_id, allergen_id) VALUES (?, ?)", [userId, allergenId]);
    }

    for (const [type, values] of Object.entries(seed.preferences)) {
      for (const targetValue of values) {
        await tx.run(
          `
            INSERT INTO user_preferences (user_id, preference_type, target_type, target_value, strength)
            VALUES (?, ?, 'free_text', ?, ?)
          `,
          [userId, type, targetValue, type === "prefer" ? 4 : 3],
        );
      }
    }

    for (const food of seed.foods) {
      const foodResult = await tx.run(
        `
          INSERT INTO foods (
            food_name, food_unit_type, meal_channel, category, serving_unit_label,
            price_krw, calories_kcal, protein_g, fat_g, carbs_g, source_label
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'dev-seed')
          ${tx.dialect === "postgres" ? "RETURNING food_id" : ""}
        `,
        [
          food.name,
          food.unitType,
          food.mealChannel,
          food.category,
          food.quantityLabel,
          food.priceKrw,
          food.caloriesKcal,
          food.proteinG,
          food.fatG,
          food.carbsG,
        ],
      );
      const foodId = Number(foodResult.lastInsertRowid);

      for (const allergen of food.allergens) {
        const allergenId = await getId(tx, "SELECT allergen_id AS id FROM allergens WHERE allergen_name = ?", allergen);
        await tx.run("INSERT INTO food_allergens (food_id, allergen_id) VALUES (?, ?)", [foodId, allergenId]);
      }

      for (const tag of food.tags) {
        const tagId = await getId(tx, "SELECT tag_id AS id FROM tags WHERE tag_name = ?", tag);
        await tx.run("INSERT INTO food_tag_map (food_id, tag_id) VALUES (?, ?)", [foodId, tagId]);
      }

      const mealType = food.category === "간편식" ? "snack" : food.category === "샐러드" ? "lunch" : "dinner";
      const candidateResult = await tx.run(
        `
          INSERT INTO meal_candidates (
            candidate_name, candidate_fingerprint, meal_type, meal_channel,
            total_price_krw, total_calories_kcal, total_protein_g, total_fat_g, total_carbs_g
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ${tx.dialect === "postgres" ? "RETURNING candidate_id" : ""}
        `,
        [
          food.name,
          `${food.mealChannel}:${mealType}:${food.name}`,
          mealType,
          food.mealChannel,
          food.priceKrw,
          food.caloriesKcal,
          food.proteinG,
          food.fatG,
          food.carbsG,
        ],
      );
      const candidateId = Number(candidateResult.lastInsertRowid);

      await tx.run(
        `
          INSERT INTO meal_candidate_items (
            candidate_id, food_id, quantity_label, quantity_bucket, item_price_krw,
            item_calories_kcal, item_protein_g, item_fat_g, item_carbs_g
          )
          VALUES (?, ?, ?, 'default', ?, ?, ?, ?, ?)
        `,
        [candidateId, foodId, food.quantityLabel, food.priceKrw, food.caloriesKcal, food.proteinG, food.fatG, food.carbsG],
      );
    }

    const weights = [
      ["2026-05-18T08:05:00", 57.1, 31.9, 19.5, "기준 체중"],
      ["2026-05-21T07:50:00", 56.9, 31.8, 19.5, "아침 공복"],
      ["2026-05-24T08:10:00", 56.7, 31.7, 19.5, "운동 다음 날"],
      ["2026-05-28T08:00:00", 56.6, 31.5, 19.6, "식단 조절"],
      ["2026-06-01T07:55:00", 56.4, 31.4, 19.6, "아침 공복"],
    ] as const;

    for (const [measuredAt, weightKg, bodyFatPercent, skeletalMuscleKg, note] of weights) {
      await tx.run(
        `
          INSERT INTO body_measurements (
            user_id, measured_at, weight_kg, height_cm, body_fat_percent,
            skeletal_muscle_kg, source, note
          )
          VALUES (?, ?, ?, ?, ?, ?, 'manual', ?)
        `,
        [userId, measuredAt, weightKg, seed.profile.heightCm, bodyFatPercent, skeletalMuscleKg, note],
      );
    }

    const week = getWeekRange(seed.today);
    await tx.run(
      `
        INSERT INTO weekly_plans (
          user_id, profile_id, plan_window_start, plan_window_end,
          weekly_budget_krw, goal_type, target_calories_kcal, status
        )
        VALUES (?, (SELECT profile_id FROM user_profiles WHERE user_id = ?), ?, ?, ?, ?, ?, 'active')
      `,
      [userId, userId, week.startDate, week.endDate, seed.profile.weeklyBudgetKrw, seed.profile.goalType, seed.profile.targetCaloriesKcal],
    );

    const mealLogs = [
      ["2026-05-26T08:20:00", "breakfast", "오트밀 요거트볼", "manual"],
      ["2026-05-26T12:30:00", "lunch", "닭가슴살 샐러드", "manual"],
      ["2026-05-27T19:10:00", "dinner", "참치김밥 외 1개", "manual"],
      ["2026-05-28T12:20:00", "lunch", "현미밥 닭안심 도시락", "manual"],
      ["2026-05-29T08:10:00", "breakfast", "삶은계란 + 저당두유", "manual"],
      ["2026-05-30T18:40:00", "dinner", "치킨텐더 샐러드", "manual"],
      ["2026-05-31T12:50:00", "lunch", "닭가슴살 샌드위치", "manual"],
      ["2026-06-01T08:15:00", "breakfast", "오트밀 요거트볼", "manual"],
      ["2026-06-01T12:40:00", "lunch", "닭가슴살 샌드위치", "manual"],
    ] as const;

    for (const [consumedAt, mealType, foodName, sourceType] of mealLogs) {
      const date = consumedAt.slice(0, 10);
      const dailyLogId = await ensureDailyLog(tx, userId, date, seed.profile.targetCaloriesKcal);
      const food = await tx.get<{ id: number; price: number; quantityLabel: string }>(
        `
          SELECT food_id AS id, price_krw AS price, serving_unit_label AS "quantityLabel"
          FROM foods
          WHERE food_name = ?
        `,
        [foodName],
      );
      if (!food) throw new Error(`Seed food lookup failed: ${foodName}`);

      await tx.run(
        `
          INSERT INTO food_logs (
            daily_log_id, user_id, food_id, meal_type, quantity_label,
            spent_money_krw, consumed_at, source_type
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [dailyLogId, userId, food.id, mealType, food.quantityLabel, food.price, consumedAt, sourceType],
      );
      await syncDailyLogTotals(tx, userId, date);
    }
  });

  return true;
}
