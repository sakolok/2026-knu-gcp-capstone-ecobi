import { getDb } from "../database/connection.js";
import type { MealType, Recommendation, RecoveryPlanRevision, ShockEventType, WeeklyPlanMeal, WeeklyPlanSummary } from "../types/domain.js";
import { addDays, getWeekRange, todayISO } from "../utils/date.js";
import { macroTargetsFromCalories } from "../utils/nutrition.js";
import { getProfile } from "./profileRepository.js";
import { createRecommendationRun, getCandidateRow, mapRecommendation } from "./recommendationRepository.js";
import { runMlRecommendationRun } from "../services/recommendation/mlRecommendationAdapter.js";

const plannedMealTypes: MealType[] = ["breakfast", "lunch", "dinner"];
const plannedMealTypeSqlOrder = "CASE meal_type WHEN 'breakfast' THEN 1 WHEN 'lunch' THEN 2 WHEN 'dinner' THEN 3 ELSE 4 END";
const plannedMealBudgetShare: Record<MealType, number> = {
  breakfast: 0.25,
  lunch: 0.375,
  dinner: 0.375,
  snack: 0,
};
const plannedMealCalorieShare: Record<MealType, number> = {
  breakfast: 0.25,
  lunch: 0.375,
  dinner: 0.375,
  snack: 0,
};
const recoveryMealTypeRank: Record<MealType, number> = {
  lunch: 0,
  dinner: 1,
  snack: 2,
  breakfast: 3,
};

const shockLabels: Record<ShockEventType, string> = {
  company_dinner: "회식",
  delivery: "배달",
  eating_out: "외식",
  other: "예상 밖 식사",
};

type PlanRow = {
  weekly_plan_id: number;
  plan_window_start: string;
  plan_window_end: string;
  weekly_budget_krw: number;
  target_calories_kcal: number;
  status: "active" | "superseded" | "archived";
};

type PlanMealRow = {
  weekly_plan_meal_id: number;
  day_index: number;
  meal_type: MealType;
  candidate_id: number | null;
  planned_price_krw: number;
  planned_calories_kcal: number;
  planned_protein_g: number;
};

type RevisionRow = {
  plan_revision_id: number;
  shock_event_id: number;
  event_type: ShockEventType;
  expected_spend_krw: number;
  plan_window_start: string;
  event_day_index: number;
  note: string | null;
  revision_status: RecoveryPlanRevision["revisionStatus"];
  blocked_constraint: RecoveryPlanRevision["blockedConstraint"];
  created_at: string;
};

type CandidateSlotOptions = {
  todayBudgetKrw?: number;
  remainingBudgetKrw?: number;
  targetMealBudgetKrw?: number;
  targetMealCaloriesKcal?: number;
  recommendationIntent?: "weekly_plan" | "recovery";
};

async function candidatesForSlot(
  userId: number,
  mealType: MealType,
  dayIndex: number,
  slotIndex: number,
  referenceDate = todayISO(),
  limit = 3,
  options: CandidateSlotOptions = {},
) {
  const profile = await getProfile(userId);
  if (!profile) return [];
  const week = getWeekRange(referenceDate);
  const todayBudgetKrw = options.todayBudgetKrw ?? Math.round(profile.weeklyBudgetKrw / 7);
  const remainingBudgetKrw = options.remainingBudgetKrw ?? profile.weeklyBudgetKrw;
  const targetMealBudgetKrw = options.targetMealBudgetKrw ?? Math.max(Math.round(todayBudgetKrw * plannedMealBudgetShare[mealType]), 0);
  const targetMealCaloriesKcal = options.targetMealCaloriesKcal ?? Math.max(Math.round(profile.targetCaloriesKcal * plannedMealCalorieShare[mealType]), 1);
  const dailyMacroTargets = macroTargetsFromCalories(profile.targetCaloriesKcal);
  const targetMealMacroTargets = macroTargetsFromCalories(targetMealCaloriesKcal);
  const recommendationIntent = options.recommendationIntent ?? "weekly_plan";
  const runId = await createRecommendationRun({
    userId,
    mealType,
    mealSequence: slotIndex + 1,
    targetMealBudgetKrw,
    targetMealCaloriesKcal,
    mealBudgetSource: "weekly_plan",
    todayBudgetKrw,
    todaySpentKrw: 0,
    remainingTodayBudgetKrw: todayBudgetKrw,
    remainingBudgetKrw,
    remainingCaloriesKcal: profile.targetCaloriesKcal,
    remainingCarbsG: dailyMacroTargets.carbsG,
    remainingProteinG: dailyMacroTargets.proteinG,
    remainingFatG: dailyMacroTargets.fatG,
    targetMealCarbsG: targetMealMacroTargets.carbsG,
    targetMealProteinG: targetMealMacroTargets.proteinG,
    targetMealFatG: targetMealMacroTargets.fatG,
    weekStart: week.startDate,
    weekEnd: week.endDate,
    strategyType: "hybrid",
    profileSnapshot: {
      ...profile,
      weeklyPlanDayIndex: dayIndex,
      mealSequence: slotIndex + 1,
      targetMealBudgetKrw,
      targetMealCaloriesKcal,
      targetMealCarbsG: targetMealMacroTargets.carbsG,
      targetMealProteinG: targetMealMacroTargets.proteinG,
      targetMealFatG: targetMealMacroTargets.fatG,
      recommendationIntent,
    },
  });

  return runMlRecommendationRun({ runId, limit });
}

function recoveryTargets(plan: WeeklyPlanSummary, expectedSpendKrw: number, mealType: MealType) {
  const recoveryWeeklyBudgetKrw = Math.max(plan.weeklyBudgetKrw - expectedSpendKrw, 0);
  const todayBudgetKrw = Math.round(recoveryWeeklyBudgetKrw / 7);
  const share = plannedMealBudgetShare[mealType];
  const calorieShare = plannedMealCalorieShare[mealType];
  return {
    todayBudgetKrw,
    remainingBudgetKrw: recoveryWeeklyBudgetKrw,
    targetMealBudgetKrw: Math.max(Math.round(todayBudgetKrw * share), share > 0 ? 700 : 0),
    targetMealCaloriesKcal: Math.max(Math.round(plan.targetCaloriesKcal * calorieShare * 0.82), calorieShare > 0 ? 250 : 1),
  };
}

function recoveryCandidateFits(candidate: Recommendation, targets: ReturnType<typeof recoveryTargets>) {
  const priceLimit = Math.max(Math.round(targets.targetMealBudgetKrw * 1.08), targets.targetMealBudgetKrw + 300);
  const calorieLimit = Math.max(Math.round(targets.targetMealCaloriesKcal * 1.25), targets.targetMealCaloriesKcal + 140);
  return candidate.totalPriceKrw <= priceLimit && candidate.totalCaloriesKcal <= calorieLimit && candidate.totalProteinG <= 70;
}

async function recoveryCandidateForSlot(
  userId: number,
  plan: WeeklyPlanSummary,
  expectedSpendKrw: number,
  meal: WeeklyPlanMeal,
  slotIndex: number,
  referenceDate = todayISO(),
) {
  const targets = recoveryTargets(plan, expectedSpendKrw, meal.mealType);
  const candidates = await candidatesForSlot(userId, meal.mealType, meal.dayIndex + 1, slotIndex, referenceDate, 8, {
    ...targets,
    recommendationIntent: "recovery",
  });
  return (
    candidates.find((candidate) => recoveryCandidateFits(candidate, targets)) ??
    candidates.find((candidate) => candidate.totalPriceKrw <= Math.max(targets.targetMealBudgetKrw * 1.15, targets.targetMealBudgetKrw + 500)) ??
    candidates[0] ??
    null
  );
}

async function getActivePlanRow(userId: number, referenceDate = todayISO()) {
  const week = getWeekRange(referenceDate);
  return getDb().get<PlanRow>(
    `
      SELECT *
      FROM weekly_plans
      WHERE user_id = ?
        AND status = 'active'
        AND plan_window_start = ?
        AND plan_window_end = ?
      LIMIT 1
    `,
    [userId, week.startDate, week.endDate],
  );
}

async function createPlan(userId: number, referenceDate = todayISO()) {
  const profile = await getProfile(userId);
  if (!profile) return null;
  const week = getWeekRange(referenceDate);

  await getDb().run("UPDATE weekly_plans SET status = 'superseded' WHERE user_id = ? AND status = 'active'", [userId]);
  const db = getDb();
  const result = await db.run(
    `
      INSERT INTO weekly_plans (
        user_id, profile_id, plan_window_start, plan_window_end,
        weekly_budget_krw, goal_type, target_calories_kcal, status
      )
      VALUES (?, (SELECT profile_id FROM user_profiles WHERE user_id = ?), ?, ?, ?, ?, ?, 'active')
      ${db.dialect === "postgres" ? "RETURNING weekly_plan_id" : ""}
    `,
    [userId, userId, week.startDate, week.endDate, profile.weeklyBudgetKrw, profile.goalType, profile.targetCaloriesKcal],
  );

  return result.lastInsertRowid;
}

async function planRowById(planId: number) {
  return getDb().get<PlanRow>("SELECT * FROM weekly_plans WHERE weekly_plan_id = ?", [planId]);
}

async function ensureWeeklyPlan(userId: number, referenceDate = todayISO()) {
  return (await getActivePlanRow(userId, referenceDate))?.weekly_plan_id ?? (await createPlan(userId, referenceDate));
}

async function insertDefaultMeals(userId: number, planId: number, referenceDate = todayISO()) {
  const existing = await getDb().get<{ count: number }>("SELECT COUNT(*) AS count FROM weekly_plan_meals WHERE weekly_plan_id = ?", [planId]);
  if ((existing?.count ?? 0) > 0) return;
  const plan = await planRowById(planId);
  if (!plan) return;
  const dailyBudgetKrw = Math.round(plan.weekly_budget_krw / 7);

  for (const [slotIndex, mealType] of plannedMealTypes.entries()) {
    const candidates = await candidatesForSlot(userId, mealType, 0, slotIndex, referenceDate, 7, {
      todayBudgetKrw: dailyBudgetKrw,
      remainingBudgetKrw: plan.weekly_budget_krw,
      targetMealBudgetKrw: Math.max(Math.round(dailyBudgetKrw * plannedMealBudgetShare[mealType]), 0),
      targetMealCaloriesKcal: Math.max(Math.round(plan.target_calories_kcal * plannedMealCalorieShare[mealType]), 1),
      recommendationIntent: "weekly_plan",
    });
    for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
      const candidate = candidates[(dayIndex + slotIndex) % Math.max(candidates.length, 1)] ?? null;
      if (!candidate) continue;
      await getDb().run(
        `
          INSERT INTO weekly_plan_meals (
            weekly_plan_id, day_index, meal_type, candidate_id,
            planned_price_krw, planned_calories_kcal, planned_protein_g
          )
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        [planId, dayIndex, mealType, candidate.id, candidate.totalPriceKrw, candidate.totalCaloriesKcal, candidate.totalProteinG],
      );
    }
  }
}

export async function generateWeeklyPlan(userId: number, referenceDate = todayISO()) {
  const planId = await createPlan(userId, referenceDate);
  if (!planId) return null;
  await insertDefaultMeals(userId, planId, referenceDate);
  return getWeeklyPlan(userId, referenceDate);
}

export async function getWeeklyPlan(userId: number, referenceDate = todayISO()): Promise<WeeklyPlanSummary | null> {
  const planId = await ensureWeeklyPlan(userId, referenceDate);
  if (!planId) return null;
  await insertDefaultMeals(userId, planId, referenceDate);
  const row = await planRowById(planId);
  if (!row) return null;

  const mealRows = await getDb().all<PlanMealRow>(
    `
      SELECT *
      FROM weekly_plan_meals
      WHERE weekly_plan_id = ?
      ORDER BY day_index, ${plannedMealTypeSqlOrder}
    `,
    [planId],
  );

  const meals = await Promise.all(
    mealRows.map(async (meal) => {
      const candidateRow = meal.candidate_id ? await getCandidateRow(meal.candidate_id) : undefined;
      const candidate = candidateRow ? await mapRecommendation(candidateRow) : null;
      return {
        id: meal.weekly_plan_meal_id,
        dayIndex: meal.day_index,
        date: addDays(row.plan_window_start, meal.day_index),
        mealType: meal.meal_type,
        candidate,
        plannedPriceKrw: meal.planned_price_krw,
        plannedCaloriesKcal: meal.planned_calories_kcal,
        plannedProteinG: meal.planned_protein_g,
      };
    }),
  );

  return {
    id: row.weekly_plan_id,
    startDate: row.plan_window_start,
    endDate: row.plan_window_end,
    weeklyBudgetKrw: row.weekly_budget_krw,
    targetCaloriesKcal: row.target_calories_kcal,
    status: row.status,
    meals,
    totals: {
      plannedPriceKrw: meals.reduce((sum, meal) => sum + meal.plannedPriceKrw, 0),
      plannedCaloriesKcal: Math.round(meals.reduce((sum, meal) => sum + meal.plannedCaloriesKcal, 0)),
      plannedProteinG: Math.round(meals.reduce((sum, meal) => sum + meal.plannedProteinG, 0)),
    },
  };
}

async function mapRevision(row: RevisionRow): Promise<RecoveryPlanRevision> {
  const suggestions = await getDb().all<{
    plan_revision_meal_id: number;
    day_index: number;
    meal_type: MealType;
    action: "replace" | "remove" | "add";
    candidate_id: number | null;
    revised_price_krw: number | null;
    revised_calories_kcal: number | null;
    revised_protein_g: number | null;
  }>(
    `
      SELECT *
      FROM plan_revision_meals
      WHERE plan_revision_id = ?
      ORDER BY day_index, ${plannedMealTypeSqlOrder}
    `,
    [row.plan_revision_id],
  );

  return {
    id: row.plan_revision_id,
    shockEventId: row.shock_event_id,
    eventType: row.event_type,
    eventLabel: shockLabels[row.event_type],
    expectedSpendKrw: row.expected_spend_krw,
    eventDate: addDays(row.plan_window_start, row.event_day_index),
    eventDayIndex: row.event_day_index,
    note: row.note,
    revisionStatus: row.revision_status,
    blockedConstraint: row.blocked_constraint,
    createdAt: row.created_at,
    suggestions: await Promise.all(
      suggestions.map(async (suggestion) => {
        const candidateRow = suggestion.candidate_id ? await getCandidateRow(suggestion.candidate_id) : undefined;
        return {
          id: suggestion.plan_revision_meal_id,
          dayIndex: suggestion.day_index,
          mealType: suggestion.meal_type,
          action: suggestion.action,
          candidate: candidateRow ? await mapRecommendation(candidateRow) : null,
          revisedPriceKrw: suggestion.revised_price_krw,
          revisedCaloriesKcal: suggestion.revised_calories_kcal,
          revisedProteinG: suggestion.revised_protein_g,
        };
      }),
    ),
  };
}

async function applyRevisionMealsToWeeklyPlan(planRevisionId: number) {
  const replacements = await getDb().all<{
    weekly_plan_meal_id: number;
    candidate_id: number;
    revised_price_krw: number | null;
    revised_calories_kcal: number | null;
    revised_protein_g: number | null;
  }>(
    `
      SELECT weekly_plan_meal_id, candidate_id, revised_price_krw, revised_calories_kcal, revised_protein_g
      FROM plan_revision_meals
      WHERE plan_revision_id = ?
        AND action = 'replace'
        AND candidate_id IS NOT NULL
    `,
    [planRevisionId],
  );

  for (const replacement of replacements) {
    await getDb().run(
      `
        UPDATE weekly_plan_meals
        SET candidate_id = ?,
            planned_price_krw = COALESCE(?, planned_price_krw),
            planned_calories_kcal = COALESCE(?, planned_calories_kcal),
            planned_protein_g = COALESCE(?, planned_protein_g)
        WHERE weekly_plan_meal_id = ?
      `,
      [
        replacement.candidate_id,
        replacement.revised_price_krw,
        replacement.revised_calories_kcal,
        replacement.revised_protein_g,
        replacement.weekly_plan_meal_id,
      ],
    );
  }
}

function recentDuplicateShockPredicate() {
  return getDb().dialect === "postgres" ? "se.created_at >= CURRENT_TIMESTAMP - INTERVAL '30 seconds'" : "se.created_at >= datetime('now', '-30 seconds')";
}

function revisionSelectSql(whereClause: string) {
  return `
      SELECT
        pr.plan_revision_id,
        se.shock_event_id,
        se.event_type,
        se.expected_spend_krw,
        wp.plan_window_start,
        se.event_day_index,
        se.note,
        pr.revision_status,
        pr.blocked_constraint,
        se.created_at
      FROM plan_revisions pr
      JOIN shock_events se ON se.shock_event_id = pr.shock_event_id
      JOIN weekly_plans wp ON wp.weekly_plan_id = pr.weekly_plan_id
      WHERE ${whereClause}
    `;
}

async function findRecentDuplicateShockRevision(
  userId: number,
  planId: number,
  input: { eventType: ShockEventType; expectedSpendKrw: number; eventDayIndex: number; note?: string | null },
) {
  const row = await getDb().get<RevisionRow>(
    `
      ${revisionSelectSql(`
        se.user_id = ?
        AND se.weekly_plan_id = ?
        AND se.event_type = ?
        AND se.expected_spend_krw = ?
        AND se.event_day_index = ?
        AND COALESCE(se.note, '') = ?
        AND ${recentDuplicateShockPredicate()}
      `)}
      ORDER BY se.created_at DESC
      LIMIT 1
    `,
    [userId, planId, input.eventType, input.expectedSpendKrw, input.eventDayIndex, input.note ?? ""],
  );
  return row ? mapRevision(row) : null;
}

export async function listRecoveryRevisions(userId: number, limit = 6) {
  const rows = await getDb().all<RevisionRow>(
    `
      ${revisionSelectSql("se.user_id = ?")}
      ORDER BY se.created_at DESC
      LIMIT ?
    `,
    [userId, limit],
  );
  return Promise.all(rows.map(mapRevision));
}

export async function createShockRecoveryPlan(
  userId: number,
  input: { eventType: ShockEventType; expectedSpendKrw: number; eventDayIndex: number; note?: string | null; referenceDate?: string },
) {
  const plan = await getWeeklyPlan(userId, input.referenceDate ?? todayISO());
  if (!plan) return null;
  const duplicate = await findRecentDuplicateShockRevision(userId, plan.id, input);
  if (duplicate) {
    await applyRevisionMealsToWeeklyPlan(duplicate.id);
    return duplicate;
  }

  const projectedSpend = plan.totals.plannedPriceKrw + input.expectedSpendKrw;
  const feasible = projectedSpend <= plan.weeklyBudgetKrw * 1.08;
  const db = getDb();
  const feasibleValue = db.dialect === "postgres" ? (feasible ? "TRUE" : "FALSE") : feasible ? "1" : "0";

  await db.transaction(async (tx) => {
    const shockResult = await tx.run(
      `
        INSERT INTO shock_events (
          user_id, weekly_plan_id, event_type, expected_spend_krw, event_day_index, note
        )
        VALUES (?, ?, ?, ?, ?, ?)
        ${tx.dialect === "postgres" ? "RETURNING shock_event_id" : ""}
      `,
      [userId, plan.id, input.eventType, input.expectedSpendKrw, input.eventDayIndex, input.note ?? null],
    );
    const shockEventId = shockResult.lastInsertRowid ?? 0;

    const revisionResult = await tx.run(
      `
        INSERT INTO plan_revisions (
          weekly_plan_id, shock_event_id, revision_status, blocked_constraint
        )
        VALUES (?, ?, ?, ?)
        ${tx.dialect === "postgres" ? "RETURNING plan_revision_id" : ""}
      `,
      [plan.id, shockEventId, feasible ? "feasible" : "infeasible", feasible ? null : "budget"],
    );
    const revisionId = revisionResult.lastInsertRowid ?? 0;

    const recoveryCandidates = plan.meals
      .filter((meal) => meal.dayIndex > input.eventDayIndex && meal.mealType !== "breakfast")
      .sort((a, b) => a.dayIndex - b.dayIndex || recoveryMealTypeRank[a.mealType] - recoveryMealTypeRank[b.mealType] || b.plannedPriceKrw - a.plannedPriceKrw);
    const selectedMeals: WeeklyPlanMeal[] = [];
    const usedMealTypes = new Set<MealType>();

    for (const meal of recoveryCandidates) {
      if (usedMealTypes.has(meal.mealType)) continue;
      selectedMeals.push(meal);
      usedMealTypes.add(meal.mealType);
      if (selectedMeals.length >= 3) break;
    }
    for (const meal of recoveryCandidates) {
      if (selectedMeals.some((selected) => selected.id === meal.id)) continue;
      selectedMeals.push(meal);
      if (selectedMeals.length >= 3) break;
    }

    const affectedMeals = selectedMeals.slice(0, 3);

    for (const [index, meal] of affectedMeals.entries()) {
      const replacement = await recoveryCandidateForSlot(userId, plan, input.expectedSpendKrw, meal, index, input.referenceDate ?? todayISO());
      if (!replacement) continue;
      await tx.run(
        `
          INSERT INTO plan_revision_meals (
            plan_revision_id, weekly_plan_meal_id, day_index, meal_type, action,
            candidate_id, revised_price_krw, revised_calories_kcal, revised_protein_g
          )
          VALUES (?, ?, ?, ?, 'replace', ?, ?, ?, ?)
        `,
        [
          revisionId,
          meal.id,
          meal.dayIndex,
          meal.mealType,
          replacement.id,
          replacement.totalPriceKrw,
          replacement.totalCaloriesKcal,
          replacement.totalProteinG,
        ],
      );
      await tx.run(
        `
          UPDATE weekly_plan_meals
          SET candidate_id = ?,
              planned_price_krw = ?,
              planned_calories_kcal = ?,
              planned_protein_g = ?
          WHERE weekly_plan_meal_id = ?
        `,
        [replacement.id, replacement.totalPriceKrw, replacement.totalCaloriesKcal, replacement.totalProteinG, meal.id],
      );
    }

    await tx.run(
      `
        INSERT INTO recovery_outcomes (
          weekly_plan_id, shock_event_id, plan_revision_id,
          was_feasible, was_accepted, counted_as_success
        )
        VALUES (?, ?, ?, ${feasibleValue}, ${tx.dialect === "postgres" ? "FALSE" : "0"}, ${feasibleValue})
      `,
      [plan.id, shockEventId, revisionId],
    );
  });

  return (await listRecoveryRevisions(userId, 1))[0] ?? null;
}

export async function deleteShockRecoveryPlan(userId: number, shockEventId: number) {
  const result = await getDb().run("DELETE FROM shock_events WHERE user_id = ? AND shock_event_id = ?", [userId, shockEventId]);
  return result.rowCount > 0 || result.changes > 0;
}
