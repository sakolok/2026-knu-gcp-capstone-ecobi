import type { MealChannel, MealType, RecommendationIntent, RecommendationTabSummary } from "../types/domain.js";
import { getWeekRange, todayISO } from "../utils/date.js";
import { getProfile } from "../repositories/profileRepository.js";
import { createMealLog, getPeriodMealSummary } from "../repositories/mealRepository.js";
import {
  createRecommendationRun,
  getCandidateRow,
  getRecommendationRunJob,
  listRecommendationsForRun,
  mapRecommendation,
  recordRecommendationFeedback,
  markRecommendationSelected,
  syncFoodCandidatesForRecommendationContext,
  updateRecommendationRunJobDispatcher,
  updateRecommendationRunJobStatus,
} from "../repositories/recommendationRepository.js";
import { mlRecommendationAdapter } from "./recommendation/mlRecommendationAdapter.js";
import { dispatchRecommendationJob } from "./recommendation/recommendationJobDispatcher.js";
import { macroTargetsFromCalories } from "../utils/nutrition.js";

export const recommendationTabs: RecommendationTabSummary[] = [
  { id: "personal", label: "맞춤 추천", description: "최근 식단, 예산, 목표 칼로리를 함께 고려합니다." },
  { id: "recovery", label: "회복 식단", description: "남은 칼로리와 부담 낮은 구성을 우선합니다." },
  { id: "protein", label: "고단백", description: "단백질 함량과 포만감을 우선합니다." },
  { id: "budget", label: "예산 절약", description: "이번 주 남은 식비 안에서 가격 효율을 우선합니다." },
];

type RecommendationOptions = {
  mealType?: MealType;
  intent?: RecommendationIntent;
  mealChannel?: MealChannel;
  limit?: number;
  mealSequence?: number;
  targetMealBudgetKrw?: number;
  targetMealCaloriesKcal?: number;
  todayBudgetKrw?: number;
};

function normalizeOptions(input?: MealType | RecommendationOptions): Required<Pick<RecommendationOptions, "mealType" | "intent" | "limit">> &
  Pick<RecommendationOptions, "mealChannel" | "mealSequence" | "targetMealBudgetKrw" | "targetMealCaloriesKcal" | "todayBudgetKrw"> {
  if (typeof input === "string") {
    return { mealType: input, intent: "personal", limit: 5 };
  }
  return {
    mealType: input?.mealType ?? "dinner",
    intent: input?.intent ?? "personal",
    mealChannel: input?.mealChannel,
    limit: input?.limit ?? 5,
    mealSequence: input?.mealSequence,
    targetMealBudgetKrw: input?.targetMealBudgetKrw,
    targetMealCaloriesKcal: input?.targetMealCaloriesKcal,
    todayBudgetKrw: input?.todayBudgetKrw,
  };
}

function defaultMealSequence(mealType: MealType, todayMealCount: number) {
  const mealOrder: Record<MealType, number> = {
    breakfast: 1,
    lunch: 2,
    dinner: 3,
    snack: 4,
  };
  return Math.max(todayMealCount + 1, mealOrder[mealType]);
}

function mealCalorieFloor(mealType: MealType, dailyTargetCalories: number) {
  const mealShare: Record<MealType, number> = {
    breakfast: 0.24,
    lunch: 0.32,
    dinner: 0.32,
    snack: 0.12,
  };
  const minimumByMeal: Record<MealType, number> = {
    breakfast: 350,
    lunch: 500,
    dinner: 500,
    snack: 180,
  };
  const plannedCalories = Math.round(Math.max(dailyTargetCalories, 900) * mealShare[mealType]);
  return Math.max(plannedCalories, minimumByMeal[mealType]);
}

function targetMealCaloriesForRecommendation(input: {
  requestedCalories?: number;
  remainingCaloriesKcal: number;
  remainingMealSlots: number;
  mealType: MealType;
  dailyTargetCalories: number;
}) {
  const floor = mealCalorieFloor(input.mealType, input.dailyTargetCalories);
  const remainingSlotCalories = Math.round(input.remainingCaloriesKcal / input.remainingMealSlots);
  const requestedCalories = Number(input.requestedCalories ?? 0);
  return Math.max(requestedCalories, remainingSlotCalories, floor);
}

function roundMacro(value: number) {
  return Number(Math.max(value, 0).toFixed(1));
}

function targetMealMacrosForRecommendation(input: {
  remainingCarbsG: number;
  remainingProteinG: number;
  remainingFatG: number;
  remainingMealSlots: number;
}) {
  const slots = Math.max(input.remainingMealSlots, 1);
  return {
    carbsG: roundMacro(input.remainingCarbsG / slots),
    proteinG: roundMacro(input.remainingProteinG / slots),
    fatG: roundMacro(input.remainingFatG / slots),
  };
}

async function createRecommendationRunForOptions(userId: number, input?: MealType | RecommendationOptions) {
  const options = normalizeOptions(input);
  const profile = await getProfile(userId);
  if (!profile) return null;

  const week = getWeekRange(todayISO());
  const weeklySummary = await getPeriodMealSummary(userId, week.startDate, week.endDate);
  const todaySummary = await getPeriodMealSummary(userId, todayISO(), todayISO());
  const dailyMacroTargets = macroTargetsFromCalories(profile.targetCaloriesKcal);
  const remainingCarbsG = roundMacro(dailyMacroTargets.carbsG - todaySummary.carbsG);
  const remainingProteinG = roundMacro(dailyMacroTargets.proteinG - todaySummary.proteinG);
  const remainingFatG = roundMacro(dailyMacroTargets.fatG - todaySummary.fatG);
  const remainingBudgetKrw = Math.max(profile.weeklyBudgetKrw - weeklySummary.spentMoneyKrw, 0);
  const remainingCaloriesKcal = Math.max(profile.targetCaloriesKcal - todaySummary.caloriesKcal, 0);
  const mealSequence = options.mealSequence ?? defaultMealSequence(options.mealType, todaySummary.mealCount);
  const remainingMealSlots = Math.max(1, 4 - mealSequence + 1);
  const todayBudgetKrw = options.todayBudgetKrw ?? Math.round(profile.weeklyBudgetKrw / 7);
  const contextTodaySpentKrw = todaySummary.spentMoneyKrw;
  const contextRemainingTodayBudgetKrw = Math.max(todayBudgetKrw - contextTodaySpentKrw, 0);
  const targetMealBudgetKrw = options.targetMealBudgetKrw ?? Math.max(Math.round(contextRemainingTodayBudgetKrw / remainingMealSlots), 0);
  const targetMealCaloriesKcal = targetMealCaloriesForRecommendation({
    requestedCalories: options.targetMealCaloriesKcal,
    remainingCaloriesKcal,
    remainingMealSlots,
    mealType: options.mealType,
    dailyTargetCalories: profile.targetCaloriesKcal,
  });
  const targetMealMacros = targetMealMacrosForRecommendation({
    remainingCarbsG,
    remainingProteinG,
    remainingFatG,
    remainingMealSlots,
  });

  await syncFoodCandidatesForRecommendationContext({
    mealType: options.mealType,
    mealChannel: options.mealChannel,
    targetMealBudgetKrw,
    targetMealCaloriesKcal,
    limit: options.limit,
  });

  const runId = await createRecommendationRun({
    userId,
    mealType: options.mealType,
    mealSequence,
    targetMealBudgetKrw,
    targetMealCaloriesKcal,
    mealBudgetSource: options.targetMealBudgetKrw === undefined ? "auto_split" : "user_input",
    todayBudgetKrw,
    todaySpentKrw: contextTodaySpentKrw,
    remainingTodayBudgetKrw: contextRemainingTodayBudgetKrw,
    remainingBudgetKrw,
    remainingCaloriesKcal,
    remainingCarbsG,
    remainingProteinG,
    remainingFatG,
    targetMealCarbsG: targetMealMacros.carbsG,
    targetMealProteinG: targetMealMacros.proteinG,
    targetMealFatG: targetMealMacros.fatG,
    weekStart: week.startDate,
    weekEnd: week.endDate,
    strategyType: options.intent === "personal" ? "cold_start" : "hybrid",
    profileSnapshot: {
      ...profile,
      recommendationIntent: options.intent,
      mealChannel: options.mealChannel ?? null,
      mealSequence,
      targetMealBudgetKrw,
      targetMealCaloriesKcal,
      targetMealCarbsG: targetMealMacros.carbsG,
      targetMealProteinG: targetMealMacros.proteinG,
      targetMealFatG: targetMealMacros.fatG,
      todayBudgetKrw,
      todaySpentKrw: contextTodaySpentKrw,
      remainingTodayBudgetKrw: contextRemainingTodayBudgetKrw,
      remainingCarbsG,
      remainingProteinG,
      remainingFatG,
    },
    requestedLimit: options.limit,
  });

  return { runId, options };
}

async function executeRecommendationRun(runId: number, limit: number) {
  await updateRecommendationRunJobStatus(runId, "running");
  try {
    const recommendations = (await mlRecommendationAdapter.recommend({ runId, limit })).recommendations;
    await updateRecommendationRunJobStatus(runId, "completed", { errorMessage: null });
    return recommendations;
  } catch (error) {
    await updateRecommendationRunJobStatus(runId, "failed", { errorMessage: error instanceof Error ? error.message : "추천 작업을 실행하지 못했습니다." });
    throw error;
  }
}

export async function getRecommendations(userId: number, input?: MealType | RecommendationOptions) {
  const prepared = await createRecommendationRunForOptions(userId, input);
  if (!prepared) return [];
  return executeRecommendationRun(prepared.runId, prepared.options.limit);
}

export async function createRecommendationJob(userId: number, input?: MealType | RecommendationOptions) {
  const prepared = await createRecommendationRunForOptions(userId, input);
  if (!prepared) return null;

  const fallbackRunner = async () => {
    await executeRecommendationRun(prepared.runId, prepared.options.limit);
  };

  try {
    const dispatched = await dispatchRecommendationJob({ runId: prepared.runId, limit: prepared.options.limit }, fallbackRunner);
    await updateRecommendationRunJobDispatcher(prepared.runId, dispatched.dispatcher);
  } catch (error) {
    await updateRecommendationRunJobStatus(prepared.runId, "failed", {
      errorMessage: error instanceof Error ? error.message : "추천 작업을 큐에 등록하지 못했습니다.",
    });
    throw error;
  }

  return getRecommendationJob(userId, prepared.runId);
}

export async function getRecommendationJob(userId: number, runId: number) {
  const job = await getRecommendationRunJob(userId, runId);
  if (!job) return null;
  const recommendations = job.candidateCount > 0 ? await listRecommendationsForRun(userId, runId) : [];
  return {
    ...job,
    recommendations,
  };
}

export async function getRecommendationJobResults(userId: number, runId: number) {
  return listRecommendationsForRun(userId, runId);
}

export async function runRecommendationJobForWorker(runId: number, limit: number) {
  return executeRecommendationRun(runId, limit);
}

export async function selectRecommendation(userId: number, candidateId: number) {
  return markRecommendationSelected(userId, candidateId);
}

export async function submitRecommendationFeedback(userId: number, candidateId: number, feedback: "accepted" | "rejected", metadata?: unknown) {
  return recordRecommendationFeedback(userId, candidateId, {
    feedback,
    interactionWeight: feedback === "accepted" ? 2 : -2,
    metadata,
  });
}

export async function logRecommendation(
  userId: number,
  candidateId: number,
  options: { consumedAt?: string; mealType?: MealType } = {},
) {
  const selected = await selectRecommendation(userId, candidateId);
  if (!selected) return null;
  const row = await getCandidateRow(candidateId);
  if (!row) return null;
  const recommendation = await mapRecommendation(row);
  const firstItem = recommendation.items[0];
  if (!firstItem) return null;

  return createMealLog(userId, {
    foodId: firstItem.foodId,
    mealType: options.mealType ?? recommendation.mealType,
    consumedAt: options.consumedAt ?? `${todayISO()}T18:30`,
    quantityLabel: firstItem.quantityLabel,
    spentMoneyKrw: firstItem.priceKrw,
    sourceType: "recommendation",
    recommendationCandidateId: selected.recommendationCandidateId,
  });
}
