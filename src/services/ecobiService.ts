import { apiFetch, toQuery } from "../api/client";
import type {
  CalendarSummary,
  DashboardSummary,
  Food,
  FoodSearchResult,
  GoalType,
  MealInsights,
  MealChannel,
  MealLog,
  MealType,
  PeriodMealSummary,
  Recommendation,
  RecommendationJob,
  RecommendationIntent,
  RecommendationTabSummary,
  RecoveryPlanRevision,
  RecoverySummary,
  ShockEventType,
  UserProfile,
  WeightDashboard,
  WeightRecord,
  WeightSummary,
  WeeklyPlanSummary,
} from "../types/domain";

export type AuthSession = {
  userId: number;
  email: string | null;
  displayName: string;
  profileComplete: boolean;
  profile: UserProfile | null;
};

export type RecommendationAiExplanation = {
  provider: "gemini" | "fallback";
  recommendationId: number;
  headline: string;
  summary: string;
  reasons: string[];
  cautions: string[];
};

export type NaturalLanguageMealDraft = {
  provider: "gemini" | "fallback";
  originalText: string;
  meal: {
    foodName: string;
    mealType: MealType;
    quantityLabel: string;
    spentMoneyKrw: number;
    caloriesKcal: number;
    proteinG: number;
    fatG: number;
    carbsG: number;
    confidence: number;
    notes: string[];
    nutritionSource: "db" | "mixed" | "gemini_estimate" | "none";
    matchedFoods: Array<{
      inputName: string;
      matchedFoodId: number | null;
      matchedFoodName: string | null;
      quantityLabel: string;
      quantityMultiplier: number;
      nutritionSource: "db" | "gemini_estimate";
    }>;
  };
};

export type OnboardingInput = {
  displayName: string;
  birthDate?: string;
  sex: "female" | "male";
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

export function getAuthMe() {
  return apiFetch<AuthSession>("/auth/me");
}

export function login(input: { loginId: string; password: string }) {
  return apiFetch<AuthSession>("/auth/login", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function signup(input: { loginId: string; password: string }) {
  return apiFetch<AuthSession>("/auth/signup", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function completeOnboarding(input: OnboardingInput) {
  return apiFetch<AuthSession>("/auth/onboarding", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getDashboard() {
  return apiFetch<DashboardSummary>("/dashboard");
}

export function getCalendarSummary(referenceDate?: string) {
  return apiFetch<CalendarSummary>(`/calendar/summary${toQuery({ referenceDate })}`);
}

export function getProfile() {
  return apiFetch<UserProfile>("/users/me/profile");
}

export function updateGoal(input: {
  goalType: GoalType;
  targetWeightKg: number;
  targetCaloriesKcal: number;
  targetCalorieDeltaKcal: number;
  weeklyBudgetKrw: number;
}) {
  return apiFetch<UserProfile>("/users/me/goals", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function updateProfile(input: { displayName: string; email?: string | null }) {
  return apiFetch<UserProfile>("/users/me/profile", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function updateBudget(input: { weeklyBudgetKrw: number }) {
  return apiFetch<UserProfile>("/users/me/budget", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function updateCalories(input: { targetCaloriesKcal: number }) {
  return apiFetch<UserProfile>("/users/me/calories", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function updateBody(input: { heightCm: number; weightKg?: number }) {
  return apiFetch<UserProfile>("/users/me/body", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function updateDemographics(input: { sex?: "male" | "female"; ageYearsSnapshot?: number }) {
  return apiFetch<UserProfile>("/users/me/demographics", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function updateAllergies(input: { allergies: string[] }) {
  return apiFetch<UserProfile>("/users/me/allergies", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function updatePreferences(input: { preferredFoods: string[]; dislikedFoods: string[] }) {
  return apiFetch<UserProfile>("/users/me/preferences", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function toggleFoodFavorite(foodId: number) {
  return apiFetch<{ foodId: number; favorited: boolean }>("/users/me/favorites", {
    method: "POST",
    body: JSON.stringify({ foodId }),
  });
}

export function createInteraction(input: {
  foodId?: number;
  candidateId?: number;
  interactionType: "impressed" | "clicked" | "accepted" | "rejected" | "skipped" | "logged" | "corrected" | "deleted";
  interactionWeight?: number;
  metadata?: Record<string, unknown>;
}) {
  return apiFetch<{ id: number }>("/users/me/interactions", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function listFoods() {
  return apiFetch<Food[]>("/catalog/foods");
}

export function searchFoods(params: {
  q?: string;
  exact?: boolean;
  mealChannel?: MealChannel;
  limit?: number;
  offset?: number;
  ids?: number[];
  names?: string[];
}) {
  const query = new URLSearchParams();
  if (params.q?.trim()) query.set("q", params.q.trim());
  if (params.exact && params.q?.trim()) query.set("exact", "true");
  if (params.mealChannel) query.set("mealChannel", params.mealChannel);
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  if (params.offset !== undefined) query.set("offset", String(params.offset));
  if (params.ids?.length) query.set("ids", params.ids.join(","));
  if (params.names?.length) query.set("names", params.names.join(","));
  const text = query.toString();
  return apiFetch<FoodSearchResult>(`/catalog/foods/search${text ? `?${text}` : ""}`);
}

export function listWeights(params: { startDate?: string; endDate?: string } = {}) {
  return apiFetch<WeightRecord[]>(`/weights${toQuery(params)}`);
}

export function getWeightDashboard(params: { rangeType?: "week" | "month" | "custom"; startDate?: string; endDate?: string } = {}) {
  return apiFetch<WeightDashboard>(`/weights/dashboard${toQuery(params)}`);
}

export function getWeightChart(params: { startDate?: string; endDate?: string } = {}) {
  return apiFetch<Array<{ date: string; weightKg: number }>>(`/weights/chart${toQuery(params)}`);
}

export function getWeightSummary() {
  return apiFetch<WeightSummary>("/weights/summary");
}

export function createWeight(input: {
  measuredAt: string;
  weightKg: number;
  note?: string;
  heightCm?: number;
  bodyFatPercent?: number;
  skeletalMuscleKg?: number;
}) {
  return apiFetch<WeightRecord>("/weights", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function deleteWeight(id: number) {
  return apiFetch<{ id: number }>(`/weights/${id}`, { method: "DELETE" });
}

export function listMeals(params: { date?: string; startDate?: string; endDate?: string; limit?: number } = {}) {
  return apiFetch<MealLog[]>(`/meals${toQuery(params)}`);
}

export function getWeeklyMeals(referenceDate?: string) {
  return apiFetch<PeriodMealSummary>(`/meals/weekly${toQuery({ referenceDate })}`);
}

export function getMealInsights(params: { date?: string; startDate?: string; endDate?: string } = {}) {
  return apiFetch<MealInsights>(`/meals/insights${toQuery(params)}`);
}

export function getMealSummary(params: { date?: string; startDate?: string; endDate?: string }) {
  return apiFetch<PeriodMealSummary>(`/meals/summary${toQuery(params)}`);
}

export function createMeal(input: {
  foodId?: number;
  foodName?: string;
  mealType: MealType;
  consumedAt: string;
  quantityLabel?: string;
  spentMoneyKrw?: number;
  caloriesKcal?: number;
  proteinG?: number;
  fatG?: number;
  carbsG?: number;
  sourceType?: "manual" | "manual_custom" | "recommendation";
  recommendationCandidateId?: number;
}) {
  return apiFetch<MealLog>("/meals", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function parseNaturalMeal(input: { text: string; mealType?: MealType; consumedAt?: string }) {
  return apiFetch<NaturalLanguageMealDraft>("/meals/ai-parse", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function deleteMeal(id: number) {
  return apiFetch<{ id: number }>(`/meals/${id}`, { method: "DELETE" });
}

export function getRecommendations(
  mealType: MealType = "dinner",
  options: {
    intent?: RecommendationIntent;
    mealChannel?: MealChannel;
    limit?: number;
    mealSequence?: number;
    targetMealBudgetKrw?: number;
    targetMealCaloriesKcal?: number;
    todayBudgetKrw?: number;
  } = {},
) {
  return apiFetch<Recommendation[]>(`/recommendations${toQuery({ mealType, ...options })}`);
}

type RecommendationRequestOptions = {
  intent?: RecommendationIntent;
  mealChannel?: MealChannel;
  limit?: number;
  mealSequence?: number;
  targetMealBudgetKrw?: number;
  targetMealCaloriesKcal?: number;
  todayBudgetKrw?: number;
};

export function createRecommendationJob(mealType: MealType = "dinner", options: RecommendationRequestOptions = {}, requestOptions: RequestInit = {}) {
  return apiFetch<RecommendationJob>("/recommendations/jobs", {
    ...requestOptions,
    method: "POST",
    body: JSON.stringify({ mealType, ...options }),
  });
}

export function getRecommendationJob(runId: number, requestOptions: RequestInit = {}) {
  return apiFetch<RecommendationJob>(`/recommendations/jobs/${runId}`, requestOptions);
}

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = window.setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

export async function waitForRecommendationJob(
  runId: number,
  options: { intervalMs?: number; timeoutMs?: number; signal?: AbortSignal } = {},
) {
  const intervalMs = options.intervalMs ?? 2500;
  const timeoutMs = options.timeoutMs ?? 300000;
  const startedAt = Date.now();

  while (Date.now() - startedAt <= timeoutMs) {
    const job = await getRecommendationJob(runId, { signal: options.signal });
    if (job.status === "completed") return job;
    if (job.status === "failed") throw new Error(job.errorMessage || "추천 작업이 실패했습니다.");
    await sleep(intervalMs, options.signal);
  }

  throw new Error("추천 작업이 예상보다 오래 걸리고 있습니다. 잠시 후 다시 확인해 주세요.");
}

export function getRecommendationTabs() {
  return apiFetch<RecommendationTabSummary[]>("/recommendations/tabs");
}

export function selectRecommendation(id: number) {
  return apiFetch<{ recommendationCandidateId: number; runId: number }>(`/recommendations/${id}/select`, {
    method: "POST",
  });
}

export function submitRecommendationFeedback(
  id: number,
  input: { feedback: "accepted" | "rejected"; metadata?: Record<string, unknown> },
) {
  return apiFetch<{
    id: number;
    candidateId: number;
    recommendationCandidateId: number;
    runId: number;
    interactionType: "accepted" | "rejected";
  }>(`/recommendations/${id}/feedback`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function logRecommendation(id: number, input: { consumedAt?: string; mealType?: MealType } = {}) {
  return apiFetch<MealLog>(`/recommendations/${id}/log`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getRecommendationAiExplanation(id: number, input: { intent?: RecommendationIntent } = {}) {
  return apiFetch<RecommendationAiExplanation>(`/recommendations/${id}/ai-explanation`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getRecoverySummary() {
  return apiFetch<RecoverySummary>("/recovery/summary");
}

export function getWeeklyPlan(referenceDate?: string) {
  return apiFetch<WeeklyPlanSummary>(`/weekly-plan${toQuery({ referenceDate })}`);
}

export function generateWeeklyPlan(referenceDate?: string) {
  return apiFetch<WeeklyPlanSummary>("/weekly-plan/generate", {
    method: "POST",
    body: JSON.stringify({ referenceDate }),
  });
}

export function listRecoveryPlans() {
  return apiFetch<RecoveryPlanRevision[]>("/recovery/plans");
}

export function createShockRecoveryPlan(input: {
  eventType: ShockEventType;
  expectedSpendKrw: number;
  eventDayIndex: number;
  note?: string;
  referenceDate?: string;
}) {
  return apiFetch<RecoveryPlanRevision>("/recovery/shocks", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function deleteShockRecoveryPlan(shockEventId: number) {
  return apiFetch<{ deleted: true }>(`/recovery/shocks/${shockEventId}`, {
    method: "DELETE",
  });
}
