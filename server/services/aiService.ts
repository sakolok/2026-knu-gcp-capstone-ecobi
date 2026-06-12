import type { GoalType, MealType, Recommendation, RecommendationIntent } from "../types/domain.js";
import { searchFoods } from "../repositories/foodRepository.js";
import { getPeriodMealSummary } from "../repositories/mealRepository.js";
import { getProfile } from "../repositories/profileRepository.js";
import { getRecommendationExplanationContext, getRecommendationForUser } from "../repositories/recommendationRepository.js";
import { todayISO } from "../utils/date.js";
import { macroTargetsFromCalories } from "../utils/nutrition.js";
import { generateGeminiJson, isGeminiConfigured } from "./geminiClient.js";

type AiProvider = "gemini" | "fallback";
type NaturalMealNutritionSource = "db" | "mixed" | "gemini_estimate" | "none";

export type RecommendationAiExplanation = {
  provider: AiProvider;
  recommendationId: number;
  headline: string;
  summary: string;
  reasons: string[];
  cautions: string[];
};

export type NaturalLanguageMealDraft = {
  provider: AiProvider;
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
    nutritionSource: NaturalMealNutritionSource;
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

type NaturalMealExtractedItem = {
  foodName: string;
  quantityLabel: string;
  quantityMultiplier: number;
  spentMoneyKrw: number;
  caloriesKcal: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
  confidence: number;
  notes: string[];
};

type NaturalMealExtraction = {
  mealType: MealType;
  items: NaturalMealExtractedItem[];
};

const goalLabel: Record<GoalType, string> = {
  maintain: "유지",
  cut: "감량",
  bulk: "증량",
};

const mealTypeLabel: Record<MealType, string> = {
  breakfast: "아침",
  lunch: "점심",
  dinner: "저녁",
  snack: "간식",
};

const recommendationIntentNarrative: Record<
  RecommendationIntent,
  {
    label: string;
    weights: Array<{ label: string; percent: number }>;
    explanation: string;
  }
> = {
  personal: {
    label: "맞춤 추천",
    weights: [
      { label: "칼로리 적합도", percent: 50 },
      { label: "저렴함", percent: 30 },
      { label: "단백질", percent: 20 },
    ],
    explanation: "남은 칼로리에 맞는지, 이번 끼 예산 안에서 부담이 낮은지, 단백질을 보완하는지를 함께 봅니다.",
  },
  recovery: {
    label: "회복 식단",
    weights: [
      { label: "칼로리 초과 방지", percent: 45 },
      { label: "저지방", percent: 30 },
      { label: "단백질", percent: 25 },
    ],
    explanation: "오늘 남은 칼로리를 넘기지 않는지, 지방 부담이 낮은지, 단백질을 보완하는지를 우선합니다.",
  },
  protein: {
    label: "고단백",
    weights: [
      { label: "단백질 충족", percent: 60 },
      { label: "단백질 밀도", percent: 25 },
      { label: "칼로리 적합도", percent: 15 },
    ],
    explanation: "남은 단백질을 채우는지, 칼로리 대비 단백질 밀도가 높은지, 남은 칼로리 범위에 맞는지를 봅니다.",
  },
  budget: {
    label: "예산 절약",
    weights: [
      { label: "저렴함", percent: 60 },
      { label: "단백질/가격 효율", percent: 25 },
      { label: "칼로리 적합도", percent: 15 },
    ],
    explanation: "이번 끼 예산 안에서 가격 부담을 낮추고, 가격 대비 단백질 효율과 남은 칼로리 적합도를 함께 봅니다.",
  },
};

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function asNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function nullableNumber(value: unknown) {
  if (value === undefined || value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatWon(value: number) {
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}

function formatKcal(value: number) {
  return `${Math.round(value).toLocaleString("ko-KR")}kcal`;
}

function formatGram(value: number) {
  return `${Number(value.toFixed(1)).toLocaleString("ko-KR")}g`;
}

function normalizeRecommendationIntent(value?: string): RecommendationIntent {
  if (value === "recovery" || value === "protein" || value === "budget") return value;
  return "personal";
}

function recommendationIntentReason(intent: RecommendationIntent) {
  if (intent === "recovery") {
    return "회복 식단 기준으로 오늘 남은 칼로리와 지방 부담을 낮추는 후보를 우선했어요.";
  }
  if (intent === "protein") {
    return "고단백 기준으로 남은 단백질을 채우면서 칼로리와 지방이 과하지 않은 후보를 우선했어요.";
  }
  if (intent === "budget") {
    return "예산 절약 기준으로 입력한 금액 안에서 가격 부담과 단백질 효율을 함께 봤어요.";
  }
  return "맞춤 추천 기준으로 오늘 남은 칼로리와 탄단지, 입력한 예산을 균형 있게 고려했어요.";
}

function recommendationBudgetReason(
  recommendation: Recommendation,
  targetMealBudgetKrw?: number | null,
  remainingTodayBudgetKrw?: number | null,
) {
  const priceText = formatWon(recommendation.totalPriceKrw);
  if (targetMealBudgetKrw !== undefined && targetMealBudgetKrw !== null && remainingTodayBudgetKrw !== undefined && remainingTodayBudgetKrw !== null) {
    return `이번 끼 입력 예산 ${formatWon(targetMealBudgetKrw)}, 남은 예산 ${formatWon(remainingTodayBudgetKrw)} 안에서 ${priceText} 후보로 비교했습니다.`;
  }
  if (targetMealBudgetKrw !== undefined && targetMealBudgetKrw !== null) {
    return `이번 끼 입력 예산 ${formatWon(targetMealBudgetKrw)} 안에서 ${priceText} 후보로 비교했습니다.`;
  }
  if (remainingTodayBudgetKrw !== undefined && remainingTodayBudgetKrw !== null) {
    return `남은 예산 ${formatWon(remainingTodayBudgetKrw)} 안에서 ${priceText} 후보로 비교했습니다.`;
  }
  return `이번 끼 예산 안에서 ${priceText}로 기록할 수 있습니다.`;
}

function recommendationMacroReason(
  recommendation: Recommendation,
  remainingCarbsG?: number | null,
  remainingProteinG?: number | null,
  remainingFatG?: number | null,
) {
  if (remainingCarbsG !== undefined && remainingCarbsG !== null && remainingProteinG !== undefined && remainingProteinG !== null && remainingFatG !== undefined && remainingFatG !== null) {
    return `오늘 남은 탄수 ${formatGram(remainingCarbsG)} 중 ${formatGram(recommendation.totalCarbsG)}, 단백질 ${formatGram(remainingProteinG)} 중 ${formatGram(recommendation.totalProteinG)}을 채우고 지방은 ${formatGram(recommendation.totalFatG)}으로 남은 기준 ${formatGram(remainingFatG)} 안에 맞췄습니다.`;
  }
  if (remainingProteinG !== undefined && remainingProteinG !== null) {
    return `오늘 남은 단백질 목표 ${formatGram(remainingProteinG)} 중 ${formatGram(recommendation.totalProteinG)}을 채웁니다.`;
  }
  return `단백질 ${formatGram(recommendation.totalProteinG)}, 탄수 ${formatGram(recommendation.totalCarbsG)}, 지방 ${formatGram(recommendation.totalFatG)} 구성을 확인했습니다.`;
}

function sanitizeText(value: unknown, fallback: string, maxLength = 180) {
  const text = String(value ?? "").trim();
  return (text || fallback).slice(0, maxLength);
}

function sanitizeList(value: unknown, fallback: string[], maxItems: number, maxLength = 120) {
  if (!Array.isArray(value)) return fallback;
  const items = value.map((item) => sanitizeText(item, "", maxLength)).filter(Boolean);
  return items.length ? items.slice(0, maxItems) : fallback;
}

function mergeLists(primary: string[], required: string[], maxItems: number) {
  return [...new Set([...primary, ...required].map((item) => sanitizeText(item, "", 120)).filter(Boolean))].slice(0, maxItems);
}

function recommendationFallback(
  recommendation: Recommendation,
  input: {
    intent?: string;
    targetMealBudgetKrw?: number | null;
    remainingTodayBudgetKrw?: number | null;
    remainingCaloriesKcal?: number | null;
    remainingCarbsG?: number | null;
    remainingProteinG?: number | null;
    remainingFatG?: number | null;
  } = {},
): RecommendationAiExplanation {
  const budgetText = `${recommendation.totalPriceKrw.toLocaleString("ko-KR")}원`;
  const intent = normalizeRecommendationIntent(input.intent);
  const intentNarrative = recommendationIntentNarrative[intent];
  const budgetReason = recommendationBudgetReason(recommendation, input.targetMealBudgetKrw, input.remainingTodayBudgetKrw);
  const remainingReason =
    input.remainingCaloriesKcal !== undefined && input.remainingCaloriesKcal !== null
      ? `추천 당시 남은 칼로리 ${formatKcal(input.remainingCaloriesKcal)} 기준에서 ${formatKcal(recommendation.totalCaloriesKcal)} 구성을 비교했습니다.`
      : `단백질 ${recommendation.totalProteinG}g, 탄수 ${recommendation.totalCarbsG}g, 지방 ${recommendation.totalFatG}g 구성을 확인했습니다.`;
  const macroReason =
    input.remainingCarbsG !== undefined &&
    input.remainingCarbsG !== null &&
    input.remainingProteinG !== undefined &&
    input.remainingProteinG !== null &&
    input.remainingFatG !== undefined &&
    input.remainingFatG !== null
      ? recommendationMacroReason(recommendation, input.remainingCarbsG, input.remainingProteinG, input.remainingFatG)
      : remainingReason;
  const nutritionReason =
    input.remainingCarbsG !== undefined && input.remainingCarbsG !== null && input.remainingFatG !== undefined && input.remainingFatG !== null
      ? macroReason
      : input.remainingProteinG !== undefined
        ? recommendationMacroReason(recommendation, null, input.remainingProteinG, null)
        : remainingReason;
  const cautions = [...(recommendation.allergenWarnings?.length ? [`알레르기 후보: ${recommendation.allergenWarnings.join(", ")}`] : [])];
  if (input.remainingCaloriesKcal !== undefined && input.remainingCaloriesKcal !== null && recommendation.totalCaloriesKcal > input.remainingCaloriesKcal) {
    cautions.push(`추천 당시 남은 칼로리보다 ${formatKcal(recommendation.totalCaloriesKcal - input.remainingCaloriesKcal)} 높습니다.`);
  }
  if (input.remainingTodayBudgetKrw !== undefined && input.remainingTodayBudgetKrw !== null && recommendation.totalPriceKrw > input.remainingTodayBudgetKrw) {
    cautions.push(`남은 예산보다 ${formatWon(recommendation.totalPriceKrw - input.remainingTodayBudgetKrw)} 높습니다.`);
  }
  return {
    provider: "fallback",
    recommendationId: recommendation.id,
    headline: `${intentNarrative.label} 기준에 맞춘 후보예요.`,
    summary: `${intentNarrative.label} 기준으로 고른 ${budgetText} · ${formatKcal(recommendation.totalCaloriesKcal)} 구성입니다.`,
    reasons: [recommendationIntentReason(intent), budgetReason, nutritionReason].slice(0, 3),
    cautions,
  };
}

function recommendationExplanationSchema() {
  return {
    type: "OBJECT",
    properties: {
      headline: { type: "STRING" },
      summary: { type: "STRING" },
      reasons: { type: "ARRAY", items: { type: "STRING" } },
      cautions: { type: "ARRAY", items: { type: "STRING" } },
    },
    required: ["headline", "summary", "reasons", "cautions"],
  };
}

function naturalMealExtractionSchema() {
  return {
    type: "OBJECT",
    properties: {
      mealType: { type: "STRING", enum: ["breakfast", "lunch", "dinner", "snack"] },
      items: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            foodName: { type: "STRING" },
            quantityLabel: { type: "STRING" },
            quantityMultiplier: { type: "NUMBER" },
            spentMoneyKrw: { type: "NUMBER" },
            caloriesKcal: { type: "NUMBER" },
            proteinG: { type: "NUMBER" },
            fatG: { type: "NUMBER" },
            carbsG: { type: "NUMBER" },
            confidence: { type: "NUMBER" },
            notes: { type: "ARRAY", items: { type: "STRING" } },
          },
          required: [
            "foodName",
            "quantityLabel",
            "quantityMultiplier",
            "spentMoneyKrw",
            "caloriesKcal",
            "proteinG",
            "fatG",
            "carbsG",
            "confidence",
            "notes",
          ],
        },
      },
    },
    required: ["mealType", "items"],
  };
}

function normalizeFoodName(value: string) {
  return value
    .toLowerCase()
    .replace(/[\s()[\]{}·,._\-&+]/g, "")
    .trim();
}

function isSafeNaturalMealMatch(inputName: string, candidateName: string) {
  const input = normalizeFoodName(inputName);
  const candidate = normalizeFoodName(candidateName);
  if (!input || !candidate) return false;
  if (candidate === input) return true;

  const addedCompositeTokens = ["프로틴", "닭가슴살", "샐러드", "김밥", "도시락", "만두", "소시지", "스테이크", "볼"];
  if (addedCompositeTokens.some((token) => candidate.includes(token) && !input.includes(token))) return false;

  if (candidate.startsWith(input) && candidate.length <= input.length + 2) return true;
  if (input.startsWith(candidate) && input.length <= candidate.length + 3) return true;
  return false;
}

async function findNaturalMealDbMatch(foodName: string) {
  const exact = await searchFoods({ q: foodName, exact: true, limit: 1 });
  if (exact.items[0]) return exact.items[0];

  const candidates = await searchFoods({ q: foodName, limit: 8 });
  return candidates.items.find((food) => isSafeNaturalMealMatch(foodName, food.name)) ?? null;
}

function sumNumbers(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0);
}

function compactNotes(notes: string[]) {
  return [...new Set(notes.map((note) => sanitizeText(note, "", 120)).filter(Boolean))].slice(0, 5);
}

function topicParticle(value: string) {
  const lastChar = value.trim().at(-1);
  if (!lastChar) return "은";
  const code = lastChar.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return "는";
  return (code - 0xac00) % 28 === 0 ? "는" : "은";
}

export async function createRecommendationAiExplanation(userId: number, candidateId: number, intent?: string): Promise<RecommendationAiExplanation | null> {
  const today = todayISO();
  const [profile, recommendation, recommendationContext, todaySummary] = await Promise.all([
    getProfile(userId),
    getRecommendationForUser(userId, candidateId),
    getRecommendationExplanationContext(userId, candidateId),
    getPeriodMealSummary(userId, today, today),
  ]);
  if (!recommendation) return null;
  const effectiveIntent = normalizeRecommendationIntent(intent);
  const targetProteinG = profile ? macroTargetsFromCalories(profile.targetCaloriesKcal).proteinG : null;
  const dailyMacroTargets = profile ? macroTargetsFromCalories(profile.targetCaloriesKcal) : null;
  const remainingCarbsG = nullableNumber(recommendationContext?.remainingCarbsG) ?? (dailyMacroTargets ? Math.max(Number((dailyMacroTargets.carbsG - todaySummary.carbsG).toFixed(1)), 0) : null);
  const remainingProteinG = nullableNumber(recommendationContext?.remainingProteinG) ?? (targetProteinG === null ? null : Math.max(Number((targetProteinG - todaySummary.proteinG).toFixed(1)), 0));
  const remainingFatG = nullableNumber(recommendationContext?.remainingFatG) ?? (dailyMacroTargets ? Math.max(Number((dailyMacroTargets.fatG - todaySummary.fatG).toFixed(1)), 0) : null);
  const remainingCaloriesKcal =
    recommendationContext?.remainingCaloriesKcal !== undefined && recommendationContext.remainingCaloriesKcal !== null
      ? asNumber(recommendationContext.remainingCaloriesKcal)
      : profile
        ? Math.max(profile.targetCaloriesKcal - todaySummary.caloriesKcal, 0)
        : null;
  const fallback = recommendationFallback(recommendation, {
    intent: effectiveIntent,
    targetMealBudgetKrw:
      recommendationContext?.targetMealBudgetKrw !== undefined && recommendationContext.targetMealBudgetKrw !== null
        ? asNumber(recommendationContext.targetMealBudgetKrw)
        : null,
    remainingTodayBudgetKrw:
      recommendationContext?.remainingTodayBudgetKrw !== undefined && recommendationContext.remainingTodayBudgetKrw !== null
        ? asNumber(recommendationContext.remainingTodayBudgetKrw)
        : null,
    remainingCaloriesKcal,
    remainingCarbsG,
    remainingProteinG,
    remainingFatG,
  });
  if (!profile || !isGeminiConfigured()) return fallback;

  try {
    const intentNarrative = recommendationIntentNarrative[effectiveIntent];
    const response = await generateGeminiJson<Omit<RecommendationAiExplanation, "provider" | "recommendationId">>({
      systemInstruction:
        "너는 식비와 영양 목표를 함께 보는 한국어 식단 코치다. 의학적 진단을 하지 말고, 제공된 DB 수치와 추천 컨텍스트 안에서만 간결하게 설명한다.",
      prompt: JSON.stringify({
        task: "추천 식단을 사용자가 이해하기 쉬운 한국어로 설명한다.",
        userProfile: {
          goal: goalLabel[profile.goalType],
          targetCaloriesKcal: profile.targetCaloriesKcal,
          targetProteinG,
          weeklyBudgetKrw: profile.weeklyBudgetKrw,
          allergies: profile.allergies,
          preferredFoods: profile.preferredFoods,
          dislikedFoods: profile.dislikedFoods,
        },
        recommendationIntent: {
          id: effectiveIntent,
          label: intentNarrative.label,
          explanation: intentNarrative.explanation,
        },
        recommendationContext: {
          runId: recommendationContext?.runId ?? null,
          mealType: recommendationContext ? mealTypeLabel[recommendationContext.mealType] : mealTypeLabel[recommendation.mealType],
          targetMealBudgetKrw: nullableNumber(recommendationContext?.targetMealBudgetKrw),
          targetMealCaloriesKcal: nullableNumber(recommendationContext?.targetMealCaloriesKcal),
          mealBudgetSource: recommendationContext?.mealBudgetSource ?? null,
          todayBudgetKrw: nullableNumber(recommendationContext?.todayBudgetKrw),
          todaySpentKrw: nullableNumber(recommendationContext?.todaySpentKrw),
          remainingTodayBudgetKrw: nullableNumber(recommendationContext?.remainingTodayBudgetKrw),
          remainingWeekBudgetKrw: nullableNumber(recommendationContext?.remainingWeekBudgetKrw),
          remainingCaloriesKcal,
          remainingCarbsG,
          remainingProteinG,
          remainingFatG,
          targetMealCarbsG: nullableNumber(recommendationContext?.targetMealCarbsG),
          targetMealProteinG: nullableNumber(recommendationContext?.targetMealProteinG),
          targetMealFatG: nullableNumber(recommendationContext?.targetMealFatG),
          scoreBreakdown: recommendationContext?.scoreBreakdown ?? null,
        },
        todayNutritionContext: {
          eatenCaloriesKcal: todaySummary.caloriesKcal,
          eatenCarbsG: todaySummary.carbsG,
          eatenProteinG: todaySummary.proteinG,
          eatenFatG: todaySummary.fatG,
          remainingCaloriesKcal,
          remainingCarbsG,
          remainingProteinG,
          remainingFatG,
        },
        recommendation: {
          name: recommendation.name,
          mealType: mealTypeLabel[recommendation.mealType],
          priceKrw: recommendation.totalPriceKrw,
          caloriesKcal: recommendation.totalCaloriesKcal,
          proteinG: recommendation.totalProteinG,
          fatG: recommendation.totalFatG,
          carbsG: recommendation.totalCarbsG,
          tags: recommendation.tags,
          allergens: recommendation.allergenWarnings ?? [],
          modelReason: recommendation.reason,
          scoreBreakdown: recommendation.scoreBreakdown ?? [],
          items: recommendation.items.map((item) => ({
            foodName: item.foodName,
            quantityLabel: item.quantityLabel,
            priceKrw: item.priceKrw,
            caloriesKcal: item.caloriesKcal,
            proteinG: item.proteinG,
          })),
        },
        outputRules: [
          "headline은 24자 이내",
          "summary는 한 문장",
          "reasons는 2~3개",
          "reasons 중 1개는 선택한 추천 목적에 왜 맞는지 사용자 친화적으로 설명",
          "퍼센트, 가중치, 정렬, 스코어 같은 내부 모델 표현은 쓰지 말 것",
          "예산 설명은 weeklyBudgetKrw가 아니라 targetMealBudgetKrw 또는 remainingTodayBudgetKrw 기준으로 작성",
          "칼로리 설명은 일일 목표 전체가 아니라 remainingCaloriesKcal 기준으로 작성",
          "단백질 설명은 targetProteinG 전체가 아니라 remainingProteinG 기준으로 작성",
          "탄수화물과 지방 설명은 remainingCarbsG, remainingFatG 기준으로 작성",
          "remainingCaloriesKcal보다 추천 칼로리가 크면 적절하다고 말하지 말고 cautions에 주의로 작성",
          "remainingTodayBudgetKrw보다 추천 가격이 크면 예산 안이라고 말하지 말고 cautions에 주의로 작성",
          "weeklyBudgetKrw는 사용자 프로필 참고값일 뿐 추천 판단 근거로 쓰지 말 것",
          "cautions는 알레르기/예산/칼로리 주의가 있을 때만 작성",
        ],
      }),
      responseSchema: recommendationExplanationSchema(),
      maxOutputTokens: 700,
      temperature: 0.2,
    });

    return {
      provider: "gemini",
      recommendationId: recommendation.id,
      headline: sanitizeText(response.headline, fallback.headline, 40),
      summary: sanitizeText(response.summary, fallback.summary, 180),
      reasons: mergeLists(fallback.reasons, sanitizeList(response.reasons, fallback.reasons, 3), 3),
      cautions: mergeLists(sanitizeList(response.cautions, [], 3), fallback.cautions, 3),
    };
  } catch (error) {
    console.error("[gemini_recommendation_explanation_error]", error);
    return fallback;
  }
}

export async function parseNaturalLanguageMeal(
  userId: number,
  input: { text: string; mealType?: MealType; consumedAt?: string },
): Promise<NaturalLanguageMealDraft> {
  const profile = await getProfile(userId);
  const defaultMealType = input.mealType ?? "dinner";
  const fallback: NaturalLanguageMealDraft = {
    provider: "fallback",
    originalText: input.text,
    meal: {
      foodName: input.text.slice(0, 80),
      mealType: defaultMealType,
      quantityLabel: "1인분",
      spentMoneyKrw: 0,
      caloriesKcal: 0,
      proteinG: 0,
      fatG: 0,
      carbsG: 0,
      confidence: 0.15,
      notes: ["Gemini 해석을 사용할 수 없어 음식명만 채웠습니다. 칼로리와 탄단지를 직접 확인해 주세요."],
      nutritionSource: "none",
      matchedFoods: [],
    },
  };
  if (!isGeminiConfigured()) return fallback;

  try {
    const response = await generateGeminiJson<NaturalMealExtraction>({
      systemInstruction:
        "너는 한국어 식단 기록 문장을 음식 항목과 수량으로 분해하는 도우미다. 영양성분은 DB 매칭 실패 시 fallback으로만 쓰이므로 보수적으로 추정한다.",
      prompt: JSON.stringify({
        task: "자연어 식단 기록에서 음식별 foodName, quantityLabel, quantityMultiplier를 추출하고, DB 매칭 실패 시 사용할 보수적 영양 추정값도 함께 작성한다.",
        userText: input.text,
        defaultMealType,
        consumedAt: input.consumedAt ?? null,
        userContext: profile
          ? {
              targetCaloriesKcal: profile.targetCaloriesKcal,
              goal: goalLabel[profile.goalType],
              allergies: profile.allergies,
            }
          : null,
        rules: [
          "items는 사용자가 실제로 먹었다고 말한 음식 단위로 나눈다.",
          "foodName은 DB 검색이 잘 되도록 음식 기본명 위주로 짧게 작성한다. 예: '계란', '고구마', '닭가슴살'.",
          "quantityLabel은 사용자 표현을 보존한다. 예: '2개', '1개', '반 공기'.",
          "quantityMultiplier는 DB의 1회 제공량을 몇 배로 먹었는지 추정한다. 예: 계란 2개는 2, 고구마 하나는 1.",
          "caloriesKcal/proteinG/fatG/carbsG/spentMoneyKrw는 DB 매칭 실패 시 fallback으로 사용할 항목별 추정값이다.",
          "영양 추정값은 한국 일반 식품 기준으로 보수적으로 작성하고, 확실하지 않으면 notes에 표시한다.",
          "인터넷 검색을 하지 않는다.",
        ],
      }),
      responseSchema: naturalMealExtractionSchema(),
      maxOutputTokens: 1000,
      temperature: 0.15,
    });

    const mealType = ["breakfast", "lunch", "dinner", "snack"].includes(String(response.mealType)) ? (response.mealType as MealType) : defaultMealType;
    const extractedItems = Array.isArray(response.items) ? response.items.slice(0, 8) : [];
    if (!extractedItems.length) return fallback;

    const resolvedItems = await Promise.all(
      extractedItems.map(async (item) => {
        const inputName = sanitizeText(item.foodName, "", 80);
        const quantityLabel = sanitizeText(item.quantityLabel, "1인분", 30);
        const quantityMultiplier = Number(clampNumber(item.quantityMultiplier, 0.1, 20, 1).toFixed(2));
        const dbFood = inputName ? await findNaturalMealDbMatch(inputName) : null;
        if (dbFood) {
          return {
            inputName,
            displayName: `${dbFood.name} ${quantityLabel}`,
            matchedFoodId: dbFood.id,
            matchedFoodName: dbFood.name,
            quantityLabel,
            quantityMultiplier,
            nutritionSource: "db" as const,
            spentMoneyKrw: dbFood.priceKrw * quantityMultiplier,
            caloriesKcal: dbFood.caloriesKcal * quantityMultiplier,
            proteinG: dbFood.proteinG * quantityMultiplier,
            fatG: dbFood.fatG * quantityMultiplier,
            carbsG: dbFood.carbsG * quantityMultiplier,
            confidence: Math.max(clampNumber(item.confidence, 0, 1, 0.7), 0.85),
            notes: [`${inputName}${topicParticle(inputName)} DB 식품 '${dbFood.name}' 기준으로 계산했습니다.`],
          };
        }

        return {
          inputName,
          displayName: `${inputName || "음식"} ${quantityLabel}`,
          matchedFoodId: null,
          matchedFoodName: null,
          quantityLabel,
          quantityMultiplier,
          nutritionSource: "gemini_estimate" as const,
          spentMoneyKrw: clampNumber(item.spentMoneyKrw, 0, 300000, 0),
          caloriesKcal: clampNumber(item.caloriesKcal, 0, 5000, 0),
          proteinG: clampNumber(item.proteinG, 0, 300, 0),
          fatG: clampNumber(item.fatG, 0, 300, 0),
          carbsG: clampNumber(item.carbsG, 0, 600, 0),
          confidence: Math.min(clampNumber(item.confidence, 0, 1, 0.45), 0.65),
          notes: [
            `${inputName || "일부 음식"}${topicParticle(inputName || "일부 음식")} DB에서 안전하게 매칭되는 식품을 찾지 못해 Gemini 추정값을 사용했습니다.`,
            ...sanitizeList(item.notes, [], 2, 100),
          ],
        };
      }),
    );

    const hasDb = resolvedItems.some((item) => item.nutritionSource === "db");
    const hasEstimate = resolvedItems.some((item) => item.nutritionSource === "gemini_estimate");
    const nutritionSource: NaturalMealNutritionSource = hasDb && hasEstimate ? "mixed" : hasDb ? "db" : "gemini_estimate";
    const confidenceCap = nutritionSource === "db" ? 0.95 : nutritionSource === "mixed" ? 0.8 : 0.65;
    const quantityLabel = resolvedItems.map((item) => item.quantityLabel).filter(Boolean).join(" + ");
    const notes = compactNotes([
      nutritionSource === "db"
        ? "영양성분은 DB 매칭 식품 기준으로 계산했습니다."
        : nutritionSource === "mixed"
          ? "DB 매칭 식품과 Gemini 추정값을 함께 사용했습니다."
          : "DB 매칭 식품이 없어 Gemini 추정값을 사용했습니다.",
      ...resolvedItems.flatMap((item) => item.notes),
    ]);

    return {
      provider: "gemini",
      originalText: input.text,
      meal: {
        foodName: sanitizeText(resolvedItems.map((item) => item.displayName).join(", "), fallback.meal.foodName, 100),
        mealType,
        quantityLabel: sanitizeText(quantityLabel, "1인분", 30),
        spentMoneyKrw: Math.round(clampNumber(sumNumbers(resolvedItems.map((item) => item.spentMoneyKrw)), 0, 300000, 0)),
        caloriesKcal: Math.round(clampNumber(sumNumbers(resolvedItems.map((item) => item.caloriesKcal)), 0, 5000, 0)),
        proteinG: Number(clampNumber(sumNumbers(resolvedItems.map((item) => item.proteinG)), 0, 300, 0).toFixed(1)),
        fatG: Number(clampNumber(sumNumbers(resolvedItems.map((item) => item.fatG)), 0, 300, 0).toFixed(1)),
        carbsG: Number(clampNumber(sumNumbers(resolvedItems.map((item) => item.carbsG)), 0, 600, 0).toFixed(1)),
        confidence: Number(Math.min(clampNumber(sumNumbers(resolvedItems.map((item) => item.confidence)) / resolvedItems.length, 0, 1, 0.5), confidenceCap).toFixed(2)),
        notes,
        nutritionSource,
        matchedFoods: resolvedItems.map((item) => ({
          inputName: item.inputName,
          matchedFoodId: item.matchedFoodId,
          matchedFoodName: item.matchedFoodName,
          quantityLabel: item.quantityLabel,
          quantityMultiplier: item.quantityMultiplier,
          nutritionSource: item.nutritionSource,
        })),
      },
    };
  } catch (error) {
    console.error("[gemini_natural_meal_parse_error]", error);
    return fallback;
  }
}
