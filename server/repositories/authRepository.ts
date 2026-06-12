import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { currentTimestampSql, getDb } from "../database/connection.js";
import type { GoalType, MealChannel, Sex } from "../types/domain.js";
import { getProfile, replaceAllergies, replacePreferences } from "./profileRepository.js";

const scrypt = promisify(scryptCallback);

type OnboardingInput = {
  displayName: string;
  birthDate?: string;
  sex: Sex;
  heightCm: number;
  weightKg: number;
  targetWeightKg: number;
  goalType: GoalType;
  activityLevel: "sedentary" | "light" | "moderate" | "active" | "athlete";
  dietType: string;
  mealTimes: {
    breakfast: string;
    lunch: string;
    dinner: string;
  };
  allergies: string[];
  dislikedFoods: string[];
  weeklyBudgetKrw: number;
  availableMealChannels: MealChannel[];
};

const activityFactors: Record<OnboardingInput["activityLevel"], number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  athlete: 1.9,
};

const goalDeltas: Record<GoalType, number> = {
  maintain: 0,
  cut: -300,
  bulk: 250,
};

function normalizeLoginId(loginId: string) {
  return loginId.trim().toLowerCase();
}

function isLoginIdConflict(error: unknown) {
  if (!(error instanceof Error)) return false;
  const maybePgError = error as Error & { code?: string; constraint?: string };
  if (maybePgError.code === "23505") {
    return maybePgError.constraint === "users_login_id_unique_idx" || /login_id/i.test(maybePgError.constraint ?? "");
  }
  return /users\.login_id|users_login_id_unique_idx|login_id/i.test(error.message);
}

function isUsersPrimaryKeyConflict(error: unknown) {
  if (!(error instanceof Error)) return false;
  const maybePgError = error as Error & { code?: string; constraint?: string };
  return maybePgError.code === "23505" && maybePgError.constraint === "users_pkey";
}

async function realignUsersSequence() {
  const db = getDb();
  if (db.dialect !== "postgres") return;
  await db.run(`
    SELECT setval(
      pg_get_serial_sequence('users', 'user_id'),
      GREATEST(COALESCE((SELECT MAX(user_id) FROM users), 0), 1),
      COALESCE((SELECT MAX(user_id) FROM users), 0) > 0
    )
  `);
}

export async function hashPassword(password: string, salt: string) {
  const hash = (await scrypt(password, salt, 32)) as Buffer;
  return hash.toString("hex");
}

async function verifyPassword(password: string, salt: string | null, expectedHash: string | null) {
  if (!salt || !expectedHash) return false;
  const actualHash = await hashPassword(password, salt);
  const actual = Buffer.from(actualHash, "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function ageFromBirthDate(birthDate?: string) {
  if (!birthDate) return 25;
  const birth = new Date(`${birthDate}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return 25;

  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const hasBirthdayPassed =
    today.getMonth() > birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() >= birth.getDate());
  if (!hasBirthdayPassed) age -= 1;
  return Math.max(1, Math.min(age, 120));
}

function calculateEnergy(input: OnboardingInput) {
  const ageYearsSnapshot = ageFromBirthDate(input.birthDate);
  const baseBmr = 10 * input.weightKg + 6.25 * input.heightCm - 5 * ageYearsSnapshot + (input.sex === "male" ? 5 : -161);
  const bmrKcal = Math.round(baseBmr);
  const activityFactor = activityFactors[input.activityLevel];
  const tdeeKcal = Math.round(bmrKcal * activityFactor);
  const targetCalorieDeltaKcal = goalDeltas[input.goalType];
  const targetCaloriesKcal = Math.max(1000, tdeeKcal + targetCalorieDeltaKcal);

  return {
    ageYearsSnapshot,
    activityFactor,
    bmrKcal,
    tdeeKcal,
    targetCaloriesKcal,
    targetCalorieDeltaKcal,
  };
}

async function isProfileComplete(userId: number) {
  const row = await getDb().get<{ profile_id: number }>("SELECT profile_id FROM user_profiles WHERE user_id = ?", [userId]);
  return Boolean(row);
}

export async function loginExistingUser(input: { loginId: string; password: string }) {
  const loginId = normalizeLoginId(input.loginId);
  const existing = await getDb().get<{
    userId: number;
    loginId: string | null;
    email: string | null;
    displayName: string | null;
    passwordHash: string | null;
    passwordSalt: string | null;
  }>(
    `
      SELECT
        user_id AS "userId",
        login_id AS "loginId",
        email,
        display_name AS "displayName",
        password_hash AS "passwordHash",
        password_salt AS "passwordSalt"
      FROM users
      WHERE lower(login_id) = ?
    `,
    [loginId],
  );

  if (!existing) return null;
  if (!(await verifyPassword(input.password, existing.passwordSalt, existing.passwordHash))) return null;

  return {
    userId: existing.userId,
    email: existing.email,
    displayName: existing.displayName || "사용자",
    profileComplete: await isProfileComplete(existing.userId),
    profile: await getProfile(existing.userId),
  };
}

export async function signupUser(input: { loginId: string; password: string }) {
  const loginId = normalizeLoginId(input.loginId);
  const existing = await getDb().get<{ userId: number }>(
    `
      SELECT user_id AS "userId"
      FROM users
      WHERE lower(login_id) = ?
    `,
    [loginId],
  );

  if (existing) return null;

  const passwordSalt = randomBytes(16).toString("hex");
  const passwordHash = await hashPassword(input.password, passwordSalt);

  const insertUser = () =>
    getDb().get<{ userId: number }>(
      `
      INSERT INTO users (login_id, password_hash, password_salt)
      VALUES (?, ?, ?)
      RETURNING user_id AS "userId"
    `,
      [loginId, passwordHash, passwordSalt],
    );

  try {
    const row = await insertUser();
    if (!row) return null;
    return getAuthSession(row.userId);
  } catch (error) {
    if (isLoginIdConflict(error)) return null;
    if (isUsersPrimaryKeyConflict(error)) {
      await realignUsersSequence();
      const row = await insertUser();
      if (!row) return null;
      return getAuthSession(row.userId);
    }
    throw error;
  }
}

export async function getAuthSession(userId: number) {
  const row = await getDb().get<{ userId: number; email: string | null; displayName: string | null }>(
    'SELECT user_id AS "userId", email, display_name AS "displayName" FROM users WHERE user_id = ?',
    [userId],
  );

  if (!row) return null;

  return {
    userId: row.userId,
    email: row.email,
    displayName: row.displayName ?? "사용자",
    profileComplete: await isProfileComplete(row.userId),
    profile: await getProfile(row.userId),
  };
}

export async function completeOnboarding(userId: number, input: OnboardingInput) {
  const energy = calculateEnergy(input);
  const allergies = input.allergies.filter((item) => item !== "없음");

  await getDb().transaction(async (tx) => {
    const availableMealChannels = tx.dialect === "postgres" ? input.availableMealChannels : JSON.stringify(input.availableMealChannels);

    await tx.run(
      `
        UPDATE users
        SET display_name = ?,
            updated_at = ${currentTimestampSql(tx)}
        WHERE user_id = ?
      `,
      [input.displayName, userId],
    );

    await tx.run(
      `
        INSERT INTO user_profiles (
          user_id, goal_type, sex, birth_date, age_years_snapshot, height_cm, target_weight_kg,
          activity_level, activity_factor, energy_target_source, bmr_kcal, tdee_kcal,
          target_calories_kcal, target_calorie_delta_kcal, weekly_budget_krw, available_meal_channels
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'calculated', ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
          goal_type = excluded.goal_type,
          sex = excluded.sex,
          birth_date = excluded.birth_date,
          age_years_snapshot = excluded.age_years_snapshot,
          height_cm = excluded.height_cm,
          target_weight_kg = excluded.target_weight_kg,
          activity_level = excluded.activity_level,
          activity_factor = excluded.activity_factor,
          energy_target_source = excluded.energy_target_source,
          bmr_kcal = excluded.bmr_kcal,
          tdee_kcal = excluded.tdee_kcal,
          target_calories_kcal = excluded.target_calories_kcal,
          target_calorie_delta_kcal = excluded.target_calorie_delta_kcal,
          weekly_budget_krw = excluded.weekly_budget_krw,
          available_meal_channels = excluded.available_meal_channels,
          updated_at = ${currentTimestampSql(tx)}
      `,
      [
        userId,
        input.goalType,
        input.sex,
        input.birthDate ?? null,
        energy.ageYearsSnapshot,
        input.heightCm,
        input.targetWeightKg,
        input.activityLevel,
        energy.activityFactor,
        energy.bmrKcal,
        energy.tdeeKcal,
        energy.targetCaloriesKcal,
        energy.targetCalorieDeltaKcal,
        input.weeklyBudgetKrw,
        availableMealChannels,
      ],
    );

    await tx.run(
      `
        INSERT INTO body_measurements (user_id, measured_at, weight_kg, height_cm, source, note)
        VALUES (?, ?, ?, ?, 'manual', '온보딩 입력')
        ON CONFLICT(user_id, measured_at) DO UPDATE SET
          weight_kg = excluded.weight_kg,
          height_cm = excluded.height_cm
      `,
      [userId, new Date().toISOString().slice(0, 19), input.weightKg, input.heightCm],
    );
  });

  await replaceAllergies(userId, allergies);
  await replacePreferences(userId, {
    preferredFoods: [],
    dislikedFoods: input.dislikedFoods,
  });

  return getAuthSession(userId);
}
