import { currentTimestampSql, getDb } from "../database/connection.js";
import type { MealChannel, MealType, Recommendation } from "../types/domain.js";
import { parseJsonArray, roundNumber } from "../utils/mappers.js";

type CandidateRow = {
  candidate_id: number;
  candidate_name: string;
  meal_type: MealType;
  meal_channel: MealChannel;
  total_price_krw: number;
  total_calories_kcal: number;
  total_protein_g: number;
  total_fat_g: number;
  total_carbs_g: number;
};

export type RecommendationRunJobStatus = "queued" | "running" | "completed" | "failed";

export type RecommendationRunJob = {
  runId: number;
  userId: number;
  status: RecommendationRunJobStatus;
  mealType: MealType;
  requestedLimit: number;
  dispatcher: string | null;
  requestedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
  candidateCount: number;
};

export type RecommendationExplanationContext = {
  runId: number;
  mealType: MealType;
  targetMealBudgetKrw: number;
  targetMealCaloriesKcal: number;
  mealBudgetSource: "user_input" | "weekly_plan" | "auto_split";
  todayBudgetKrw: number | null;
  todaySpentKrw: number;
  remainingTodayBudgetKrw: number | null;
  remainingWeekBudgetKrw: number | null;
  remainingCaloriesKcal: number | null;
  remainingCarbsG: number | null;
  remainingProteinG: number | null;
  remainingFatG: number | null;
  targetMealCarbsG: number | null;
  targetMealProteinG: number | null;
  targetMealFatG: number | null;
  requestedAt: string;
  scoreBreakdown: string | null;
};

type CandidateSeedFoodRow = {
  food_id: number;
  food_name: string;
  meal_channel: MealChannel;
  serving_unit_label: string | null;
  price_krw: number;
  calories_kcal: number;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
};

const RECOMMENDATION_ITEM_LIMITS = {
  caloriesKcal: 1100,
  proteinG: 85,
  fatG: 85,
  carbsG: 180,
};

const RECOMMENDATION_CANDIDATE_LIMITS = {
  proteinG: 95,
  fatG: 110,
  carbsG: 240,
};

function activeClause(column = "is_active") {
  return getDb().dialect === "postgres" ? `${column} IS TRUE` : `${column} = 1`;
}

function recommendationFoodQualityClause() {
  return `
    calories_kcal <= ${RECOMMENDATION_ITEM_LIMITS.caloriesKcal}
    AND protein_g <= ${RECOMMENDATION_ITEM_LIMITS.proteinG}
    AND fat_g <= ${RECOMMENDATION_ITEM_LIMITS.fatG}
    AND carbs_g <= ${RECOMMENDATION_ITEM_LIMITS.carbsG}
  `;
}

function recommendationCandidateQualityClause() {
  return `
    total_protein_g <= ${RECOMMENDATION_CANDIDATE_LIMITS.proteinG}
    AND total_fat_g <= ${RECOMMENDATION_CANDIDATE_LIMITS.fatG}
    AND total_carbs_g <= ${RECOMMENDATION_CANDIDATE_LIMITS.carbsG}
  `;
}

async function tagsForCandidate(candidateId: number) {
  const rows = await getDb().all<{ name: string }>(
    `
      SELECT DISTINCT t.tag_name AS name
      FROM meal_candidate_items mci
      JOIN food_tag_map ft ON ft.food_id = mci.food_id
      JOIN tags t ON t.tag_id = ft.tag_id
      WHERE mci.candidate_id = ?
      ORDER BY t.tag_name
    `,
    [candidateId],
  );
  return rows.map((row) => row.name);
}

export async function getCandidateFacts(candidateId: number) {
  const rows = await getDb().all<{ foodName: string; tagName: string | null; allergenName: string | null }>(
    `
      SELECT
        f.food_name AS "foodName",
        t.tag_name AS "tagName",
        a.allergen_name AS "allergenName"
      FROM meal_candidate_items mci
      JOIN foods f ON f.food_id = mci.food_id
      LEFT JOIN food_tag_map ft ON ft.food_id = f.food_id
      LEFT JOIN tags t ON t.tag_id = ft.tag_id
      LEFT JOIN food_allergens fa ON fa.food_id = f.food_id
      LEFT JOIN allergens a ON a.allergen_id = fa.allergen_id
      WHERE mci.candidate_id = ?
      ORDER BY mci.item_order
    `,
    [candidateId],
  );

  return {
    foodNames: [...new Set(rows.map((row) => row.foodName))],
    tags: [...new Set(rows.map((row) => row.tagName).filter((tag): tag is string => Boolean(tag)))],
    allergens: [...new Set(rows.map((row) => row.allergenName).filter((allergen): allergen is string => Boolean(allergen)))],
  };
}

async function ensureCandidatePool(mealType: MealType) {
  const db = getDb();
  const minimumCandidatePoolSize = 8;
  const existing = await db.get<{ count: number }>(
    `SELECT COUNT(*) AS count FROM meal_candidates WHERE meal_type = ? AND ${activeClause()}`,
    [mealType],
  );
  if (Number(existing?.count ?? 0) >= minimumCandidatePoolSize) return;

  const foods = await db.all<CandidateSeedFoodRow>(
    `
      SELECT
        food_id,
        food_name,
        meal_channel,
        serving_unit_label,
        price_krw,
        calories_kcal,
        protein_g,
        fat_g,
        carbs_g
      FROM foods
      WHERE ${activeClause()}
        AND ${recommendationFoodQualityClause()}
      ORDER BY protein_g DESC, price_krw ASC, calories_kcal ASC
      LIMIT 240
    `,
  );

  for (const food of foods) {
    const fingerprint = `single-food:${mealType}:${food.food_id}`;
    await db.run(
      `
        INSERT INTO meal_candidates (
          candidate_name, candidate_fingerprint, meal_type, meal_channel,
          total_price_krw, total_calories_kcal, total_protein_g, total_fat_g, total_carbs_g,
          generation_source
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'seed')
        ON CONFLICT(candidate_fingerprint) DO NOTHING
      `,
      [
        food.food_name,
        fingerprint,
        mealType,
        food.meal_channel,
        food.price_krw,
        food.calories_kcal,
        food.protein_g,
        food.fat_g,
        food.carbs_g,
      ],
    );

    const candidate = await db.get<{ candidateId: number }>(
      `SELECT candidate_id AS "candidateId" FROM meal_candidates WHERE candidate_fingerprint = ?`,
      [fingerprint],
    );
    if (!candidate) continue;

    await db.run(
      `
        INSERT INTO meal_candidate_items (
          candidate_id, food_id, quantity_label, quantity_bucket, item_order,
          item_price_krw, item_calories_kcal, item_protein_g, item_fat_g, item_carbs_g
        )
        VALUES (?, ?, ?, 'single', 1, ?, ?, ?, ?, ?)
        ON CONFLICT(candidate_id, item_order) DO NOTHING
      `,
      [
        candidate.candidateId,
        food.food_id,
        food.serving_unit_label ?? "1인분",
        food.price_krw,
        food.calories_kcal,
        food.protein_g,
        food.fat_g,
        food.carbs_g,
      ],
    );
  }
}

export async function syncFoodCandidatesForRecommendationContext(input: {
  mealType: MealType;
  mealChannel?: MealChannel;
  targetMealBudgetKrw: number;
  targetMealCaloriesKcal: number;
  limit?: number;
}) {
  const db = getDb();
  const targetBudgetKrw = Math.max(Math.round(input.targetMealBudgetKrw || 0), 0);
  if (targetBudgetKrw <= 0) return 0;

  const targetCaloriesKcal = Math.max(Number(input.targetMealCaloriesKcal || 0), 500);
  const maxCaloriesKcal = Math.max(targetCaloriesKcal * 1.85, targetCaloriesKcal + 300);
  const foodLimit = Math.min(Math.max((input.limit ?? 7) * 80, 240), 900);
  const clauses = [activeClause(), "price_krw <= ?", "calories_kcal <= ?", recommendationFoodQualityClause()];
  const params: Array<string | number | null> = [targetBudgetKrw, maxCaloriesKcal];
  if (input.mealChannel) {
    clauses.push("meal_channel = ?");
    params.push(input.mealChannel);
  }

  const foods = await db.all<CandidateSeedFoodRow>(
    `
      SELECT
        food_id,
        food_name,
        meal_channel,
        serving_unit_label,
        price_krw,
        calories_kcal,
        protein_g,
        fat_g,
        carbs_g
      FROM foods
      WHERE ${clauses.join(" AND ")}
      ORDER BY
        ABS(price_krw - ?) ASC,
        ABS(calories_kcal - ?) ASC,
        protein_g DESC,
        food_id DESC
      LIMIT ?
    `,
    [...params, targetBudgetKrw, targetCaloriesKcal, foodLimit],
  );

  if (!foods.length) return 0;

  return db.transaction(async (tx) => {
    let inserted = 0;
    for (const food of foods) {
      const fingerprint = `single-food:${input.mealType}:${food.food_id}`;
      const result = await tx.run(
        `
          INSERT INTO meal_candidates (
            candidate_name, candidate_fingerprint, meal_type, meal_channel,
            total_price_krw, total_calories_kcal, total_protein_g, total_fat_g, total_carbs_g,
            generation_source
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'seed')
          ON CONFLICT(candidate_fingerprint) DO NOTHING
        `,
        [
          food.food_name,
          fingerprint,
          input.mealType,
          food.meal_channel,
          food.price_krw,
          food.calories_kcal,
          food.protein_g,
          food.fat_g,
          food.carbs_g,
        ],
      );
      if (result.rowCount > 0) inserted += 1;

      const candidate = await tx.get<{ candidateId: number }>(
        `SELECT candidate_id AS "candidateId" FROM meal_candidates WHERE candidate_fingerprint = ?`,
        [fingerprint],
      );
      if (!candidate) continue;

      await tx.run(
        `
          INSERT INTO meal_candidate_items (
            candidate_id, food_id, quantity_label, quantity_bucket, item_order,
            item_price_krw, item_calories_kcal, item_protein_g, item_fat_g, item_carbs_g
          )
          VALUES (?, ?, ?, 'single', 1, ?, ?, ?, ?, ?)
          ON CONFLICT(candidate_id, item_order) DO NOTHING
        `,
        [
          candidate.candidateId,
          food.food_id,
          food.serving_unit_label ?? "1인분",
          food.price_krw,
          food.calories_kcal,
          food.protein_g,
          food.fat_g,
          food.carbs_g,
        ],
      );
    }
    return inserted;
  });
}

async function itemsForCandidate(candidateId: number) {
  return getDb().all<Recommendation["items"][number]>(
    `
      SELECT
        f.food_id AS "foodId",
        f.food_name AS "foodName",
        mci.quantity_label AS "quantityLabel",
        mci.item_price_krw AS "priceKrw",
        mci.item_calories_kcal AS "caloriesKcal",
        mci.item_protein_g AS "proteinG"
      FROM meal_candidate_items mci
      JOIN foods f ON f.food_id = mci.food_id
      WHERE mci.candidate_id = ?
      ORDER BY mci.item_order
    `,
    [candidateId],
  );
}

export async function listCandidateRows(filters: { mealType?: MealType; mealChannel?: MealChannel } = {}) {
  if (filters.mealType) await ensureCandidatePool(filters.mealType);

  const clauses = [activeClause(), recommendationCandidateQualityClause()];
  const params: Array<string | number | null> = [];
  if (filters.mealType) {
    clauses.push("meal_type = ?");
    params.push(filters.mealType);
  }
  if (filters.mealChannel) {
    clauses.push("meal_channel = ?");
    params.push(filters.mealChannel);
  }

  return getDb().all<CandidateRow>(
    `
      SELECT *
      FROM meal_candidates
      WHERE ${clauses.join(" AND ")}
      ORDER BY total_protein_g DESC, total_price_krw ASC
    `,
    params,
  );
}

export async function listCandidateInteractionScores(userId: number) {
  const rows = await getDb().all<{ candidateId: number; score: number }>(
    `
      SELECT candidate_id AS "candidateId", SUM(interaction_weight) AS score
      FROM user_item_interactions
      WHERE user_id = ?
        AND candidate_id IS NOT NULL
        AND interaction_weight > 0
      GROUP BY candidate_id
    `,
    [userId],
  );

  return new Map(rows.map((row) => [row.candidateId, Number(row.score)]));
}

export async function getCandidateRow(candidateId: number) {
  const activeCandidateClause = activeClause();
  return getDb().get<CandidateRow>(
    `
      SELECT *
      FROM meal_candidates
      WHERE candidate_id = ?
        AND ${activeCandidateClause}
        AND ${recommendationCandidateQualityClause()}
    `,
    [candidateId],
  );
}

export async function createRecommendationRun(input: {
  userId: number;
  mealType: MealType;
  mealSequence: number;
  targetMealBudgetKrw: number;
  targetMealCaloriesKcal: number;
  mealBudgetSource: "user_input" | "weekly_plan" | "auto_split";
  todayBudgetKrw: number;
  todaySpentKrw: number;
  remainingTodayBudgetKrw: number;
  remainingBudgetKrw: number;
  remainingCaloriesKcal: number;
  remainingCarbsG: number;
  remainingProteinG: number;
  remainingFatG: number;
  targetMealCarbsG: number;
  targetMealProteinG: number;
  targetMealFatG: number;
  weekStart: string;
  weekEnd: string;
  strategyType: "cold_start" | "hybrid" | "personalized";
  profileSnapshot: unknown;
  requestedLimit?: number;
  jobStatus?: RecommendationRunJobStatus;
  jobDispatcher?: string | null;
}) {
  const db = getDb();
  const profileSnapshotValue = db.dialect === "postgres" ? "?::jsonb" : "?";
  const result = await db.run(
    `
      INSERT INTO recommendation_runs (
        user_id, context_meal_type, meal_sequence, target_meal_budget_krw,
        target_meal_calories_kcal, meal_budget_source, context_today_budget_krw,
        context_today_spent_krw, context_remaining_today_budget_krw, context_remaining_budget_krw,
        context_remaining_calories_kcal, context_remaining_carbs_g, context_remaining_protein_g,
        context_remaining_fat_g, target_meal_carbs_g, target_meal_protein_g, target_meal_fat_g,
        context_week_start, context_week_end,
        strategy_type, profile_snapshot, requested_limit, job_status, job_dispatcher
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${profileSnapshotValue}, ?, ?, ?)
      ${db.dialect === "postgres" ? "RETURNING run_id" : ""}
    `,
    [
      input.userId,
      input.mealType,
      input.mealSequence,
      input.targetMealBudgetKrw,
      input.targetMealCaloriesKcal,
      input.mealBudgetSource,
      input.todayBudgetKrw,
      input.todaySpentKrw,
      input.remainingTodayBudgetKrw,
      input.remainingBudgetKrw,
      input.remainingCaloriesKcal,
      input.remainingCarbsG,
      input.remainingProteinG,
      input.remainingFatG,
      input.targetMealCarbsG,
      input.targetMealProteinG,
      input.targetMealFatG,
      input.weekStart,
      input.weekEnd,
      input.strategyType,
      JSON.stringify(input.profileSnapshot),
      input.requestedLimit ?? 5,
      input.jobStatus ?? "queued",
      input.jobDispatcher ?? null,
    ],
  );
  return result.lastInsertRowid ?? 0;
}

export async function updateRecommendationRunJobStatus(
  runId: number,
  status: RecommendationRunJobStatus,
  input: { dispatcher?: string | null; errorMessage?: string | null } = {},
) {
  const db = getDb();
  const now = currentTimestampSql(db);
  const startedAtSql = status === "running" ? `job_started_at = COALESCE(job_started_at, ${now}),` : "";
  const completedAtSql = status === "completed" || status === "failed" ? `job_completed_at = ${now},` : "";
  await db.run(
    `
      UPDATE recommendation_runs
      SET job_status = ?,
          ${startedAtSql}
          ${completedAtSql}
          job_error_message = ?,
          job_dispatcher = COALESCE(?, job_dispatcher)
      WHERE run_id = ?
    `,
    [status, input.errorMessage ?? null, input.dispatcher ?? null, runId],
  );
}

export async function updateRecommendationRunJobDispatcher(runId: number, dispatcher: string) {
  await getDb().run(
    `
      UPDATE recommendation_runs
      SET job_dispatcher = ?
      WHERE run_id = ?
    `,
    [dispatcher, runId],
  );
}

export async function getRecommendationRunJob(userId: number, runId: number) {
  return getDb().get<RecommendationRunJob>(
    `
      SELECT
        rr.run_id AS "runId",
        rr.user_id AS "userId",
        rr.job_status AS "status",
        rr.context_meal_type AS "mealType",
        rr.requested_limit AS "requestedLimit",
        rr.job_dispatcher AS "dispatcher",
        rr.requested_at AS "requestedAt",
        rr.job_started_at AS "startedAt",
        rr.job_completed_at AS "completedAt",
        rr.job_error_message AS "errorMessage",
        COUNT(rc.recommendation_candidate_id) AS "candidateCount"
      FROM recommendation_runs rr
      LEFT JOIN recommendation_candidates rc ON rc.run_id = rr.run_id
      WHERE rr.user_id = ? AND rr.run_id = ?
      GROUP BY
        rr.run_id, rr.user_id, rr.job_status, rr.context_meal_type, rr.requested_limit,
        rr.job_dispatcher, rr.requested_at, rr.job_started_at, rr.job_completed_at, rr.job_error_message
    `,
    [userId, runId],
  );
}

export async function listRecommendationsForRun(userId: number, runId: number) {
  const activeCandidateClause = activeClause("mc.is_active");
  const rows = await getDb().all<CandidateRow & { score?: number }>(
    `
      SELECT
        mc.*,
        rc.final_score AS score
      FROM recommendation_candidates rc
      JOIN recommendation_runs rr ON rr.run_id = rc.run_id
      JOIN meal_candidates mc ON mc.candidate_id = rc.candidate_id
      WHERE rr.user_id = ?
        AND rr.run_id = ?
        AND ${activeCandidateClause}
        AND ${recommendationCandidateQualityClause()}
      ORDER BY CASE WHEN rc.final_rank IS NULL THEN 1 ELSE 0 END, rc.final_rank ASC, rc.final_score DESC
    `,
    [userId, runId],
  );
  return Promise.all(rows.map((row) => mapRecommendation(row)));
}

export async function getRecommendationForUser(userId: number, candidateId: number) {
  const activeCandidateClause = activeClause("mc.is_active");
  const row = await getDb().get<CandidateRow & { score?: number }>(
    `
      SELECT
        mc.*,
        rc.final_score AS score
      FROM recommendation_candidates rc
      JOIN recommendation_runs rr ON rr.run_id = rc.run_id
      JOIN meal_candidates mc ON mc.candidate_id = rc.candidate_id
      WHERE rr.user_id = ?
        AND rc.candidate_id = ?
        AND ${activeCandidateClause}
        AND ${recommendationCandidateQualityClause()}
      ORDER BY rc.created_at DESC
      LIMIT 1
    `,
    [userId, candidateId],
  );
  return row ? mapRecommendation(row) : null;
}

export async function getRecommendationExplanationContext(userId: number, candidateId: number) {
  return getDb().get<RecommendationExplanationContext>(
    `
      SELECT
        rr.run_id AS "runId",
        rr.context_meal_type AS "mealType",
        rr.target_meal_budget_krw AS "targetMealBudgetKrw",
        rr.target_meal_calories_kcal AS "targetMealCaloriesKcal",
        rr.meal_budget_source AS "mealBudgetSource",
        rr.context_today_budget_krw AS "todayBudgetKrw",
        rr.context_today_spent_krw AS "todaySpentKrw",
        rr.context_remaining_today_budget_krw AS "remainingTodayBudgetKrw",
        rr.context_remaining_budget_krw AS "remainingWeekBudgetKrw",
        rr.context_remaining_calories_kcal AS "remainingCaloriesKcal",
        rr.context_remaining_carbs_g AS "remainingCarbsG",
        rr.context_remaining_protein_g AS "remainingProteinG",
        rr.context_remaining_fat_g AS "remainingFatG",
        rr.target_meal_carbs_g AS "targetMealCarbsG",
        rr.target_meal_protein_g AS "targetMealProteinG",
        rr.target_meal_fat_g AS "targetMealFatG",
        rr.requested_at AS "requestedAt",
        rc.score_breakdown AS "scoreBreakdown"
      FROM recommendation_candidates rc
      JOIN recommendation_runs rr ON rr.run_id = rc.run_id
      WHERE rr.user_id = ? AND rc.candidate_id = ?
      ORDER BY rc.created_at DESC
      LIMIT 1
    `,
    [userId, candidateId],
  );
}

export async function persistRecommendationCandidate(input: {
  runId: number;
  candidateId: number;
  score: number;
  rank: number;
  scoreBreakdown: unknown;
}) {
  const db = getDb();
  const scoreBreakdownValue = db.dialect === "postgres" ? "?::jsonb" : "?";
  await getDb().run(
    `
      INSERT INTO recommendation_candidates (
        run_id, candidate_id, rule_score, final_score, final_rank, score_breakdown
      )
      VALUES (?, ?, ?, ?, ?, ${scoreBreakdownValue})
    `,
    [input.runId, input.candidateId, input.score, input.score, input.rank, JSON.stringify(input.scoreBreakdown)],
  );
}

export async function mapRecommendation(row: CandidateRow & { score?: number; reason?: string; goalFit?: string }): Promise<Recommendation> {
  const facts = await getCandidateFacts(row.candidate_id);
  return {
    id: row.candidate_id,
    name: row.candidate_name,
    mealType: row.meal_type,
    mealChannel: row.meal_channel,
    totalPriceKrw: row.total_price_krw,
    totalCaloriesKcal: row.total_calories_kcal,
    totalProteinG: row.total_protein_g,
    totalFatG: row.total_fat_g,
    totalCarbsG: row.total_carbs_g,
    reason: row.reason ?? "예산과 단백질 기준에 맞는 식단입니다.",
    goalFit: row.goalFit ?? "목표 칼로리 안에서 단백질을 보강합니다.",
    score: roundNumber(row.score ?? 0, 1),
    tags: facts.tags.length ? facts.tags : await tagsForCandidate(row.candidate_id),
    allergenWarnings: facts.allergens,
    items: await itemsForCandidate(row.candidate_id),
  };
}

export async function getRecommendationReason(candidateId: number) {
  const latest = await getDb().get<{ breakdown: string }>(
    `
      SELECT rc.score_breakdown AS breakdown
      FROM recommendation_candidates rc
      WHERE rc.candidate_id = ?
      ORDER BY rc.created_at DESC
      LIMIT 1
    `,
    [candidateId],
  );
  return parseJsonArray<string>(latest?.breakdown, []);
}

async function getLatestRecommendationCandidateForUser(userId: number, candidateId: number) {
  return getDb().get<{ recommendationCandidateId: number; runId: number }>(
    `
      SELECT rc.recommendation_candidate_id AS "recommendationCandidateId", rc.run_id AS "runId"
      FROM recommendation_candidates rc
      JOIN recommendation_runs rr ON rr.run_id = rc.run_id
      WHERE rr.user_id = ? AND rc.candidate_id = ?
      ORDER BY rc.created_at DESC
      LIMIT 1
    `,
    [userId, candidateId],
  );
}

export async function recordRecommendationFeedback(
  userId: number,
  candidateId: number,
  input: {
    feedback: "accepted" | "rejected";
    interactionWeight: number;
    metadata?: unknown;
  },
) {
  const latest = await getLatestRecommendationCandidateForUser(userId, candidateId);
  if (!latest) return null;

  const db = getDb();
  const metadataValue = db.dialect === "postgres" ? "?::jsonb" : "?";
  const result = await db.run(
    `
      INSERT INTO user_item_interactions (
        user_id, candidate_id, recommendation_candidate_id, run_id,
        interaction_type, interaction_weight, metadata
      )
      VALUES (?, ?, ?, ?, ?, ?, ${metadataValue})
      ${db.dialect === "postgres" ? "RETURNING interaction_id" : ""}
    `,
    [
      userId,
      candidateId,
      latest.recommendationCandidateId,
      latest.runId,
      input.feedback,
      input.interactionWeight,
      input.metadata === undefined ? null : JSON.stringify(input.metadata),
    ],
  );

  return {
    id: result.lastInsertRowid ?? 0,
    candidateId,
    recommendationCandidateId: latest.recommendationCandidateId,
    runId: latest.runId,
    interactionType: input.feedback,
  };
}

export async function markRecommendationSelected(userId: number, candidateId: number) {
  const latest = await getLatestRecommendationCandidateForUser(userId, candidateId);

  if (!latest) return null;

  const selectedValue = getDb().dialect === "postgres" ? "TRUE" : "1";
  await getDb().run(
    `
      UPDATE recommendation_candidates
      SET was_selected = ${selectedValue}, selected_at = ${currentTimestampSql()}
      WHERE recommendation_candidate_id = ?
    `,
    [latest.recommendationCandidateId],
  );

  await getDb().run(
    `
      INSERT INTO user_item_interactions (
        user_id, candidate_id, recommendation_candidate_id, run_id,
        interaction_type, interaction_weight
      )
      VALUES (?, ?, ?, ?, 'accepted', 1)
    `,
    [userId, candidateId, latest.recommendationCandidateId, latest.runId],
  );

  return latest;
}
