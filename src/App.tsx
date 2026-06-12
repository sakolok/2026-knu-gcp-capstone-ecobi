import { FormEvent, lazy, Suspense, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type Ref } from "react";
import AOS from "aos";
import { clearStoredAuthSession, readStoredAuthSession, writeStoredAuthSession } from "./api/client";
import successCheckAnimation from "./assets/lottie/success-check.json";
import { AuthOnboarding } from "./components/auth/AuthOnboarding";
import {
  createInteraction,
  createMeal,
  createRecommendationJob,
  createShockRecoveryPlan,
  createWeight,
  deleteMeal,
  deleteShockRecoveryPlan,
  generateWeeklyPlan,
  getAuthMe,
  getMealSummary,
  getRecommendationAiExplanation,
  getWeeklyPlan,
  getWeightDashboard,
  listRecoveryPlans,
  logRecommendation,
  parseNaturalMeal,
  searchFoods,
  submitRecommendationFeedback,
  toggleFoodFavorite,
  updateAllergies,
  updateBody,
  updateBudget,
  updateCalories,
  updateDemographics,
  updateGoal,
  updatePreferences,
  updateProfile,
  waitForRecommendationJob,
  type AuthSession,
  type NaturalLanguageMealDraft,
  type RecommendationAiExplanation,
} from "./services/ecobiService";
import {
  buildRecommendationViewModels,
  getAdditionalRecommendationItems,
  getVisibleRecommendationChoiceItems,
  recommendationTabs as fallbackRecommendationTabs,
  type RecommendationTab,
  type RecommendationViewModel,
} from "./services/recommendationAdapter";
import type {
  CalendarSummary,
  DashboardSummary,
  Food,
  GoalType,
  MealLog,
  MealType,
  NutritionSummary,
  PeriodMealSummary,
  Recommendation,
  RecoveryPlanRevision,
  ShockEventType,
  WeightRecord,
  WeightDashboard,
  WeeklyPlanMeal,
  WeeklyPlanSummary,
} from "./types/domain";
import { addDays, formatKcal, formatWon, goalLabel, mealTypeLabel, todayISO } from "./utils/format";
import { useCurrentTimeLabel } from "./utils/time";
import { useEcobiData } from "./hooks/useEcobiData";

type Screen = "home" | "recommend" | "recover" | "my" | "record" | "calendar";
type RecordMode = "diet" | "weight" | "budget";
type ModalType = "profile" | "budget" | "goal" | "calories" | "body" | "sex" | "age" | "allergies" | "preferences";
type RecordTab = "recent" | "preferred" | "search" | "manual";
type MealPeriod = "today" | "week" | "recent" | "custom";
type WeightRange = "week" | "month";
type QuickAddAction = "diet" | "weight" | "budget";
type RecommendationReaction = "accepted" | "skipped";
type RecommendationMotion = { candidateId: number; type: RecommendationReaction | "logged" | "selected"; nonce: number };
type PendingRecommendationRecord = { recommendation: Recommendation; openRecordAfter: boolean };
type MealAddedToast = { id: number; title: string; helper: string };
type SuccessAnimationTone = "meal" | "recommendation" | "recovery";
type SuccessAnimationCue = { id: number; tone: SuccessAnimationTone };
type SubmittedRecommendationRequest = {
  requestId: number;
  mealType: MealType;
  intent: RecommendationTab;
  mealSequence: number;
  targetMealBudgetKrw: number;
  targetMealCaloriesKcal: number;
  todayBudgetKrw: number;
};

const SuccessLottie = lazy(() => import("lottie-react"));

function FaIcon({ name, size = 18, className = "" }: { name: string; size?: number; className?: string }) {
  return <i className={`fa fa-${name} ${className}`.trim()} aria-hidden="true" style={{ fontSize: size, lineHeight: 1 }} />;
}

function RotateCcwIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  );
}

const mealTypes: MealType[] = ["breakfast", "lunch", "dinner", "snack"];
const mealTypeRank: Record<MealType, number> = {
  breakfast: 0,
  lunch: 1,
  dinner: 2,
  snack: 3,
};
const allergenOptions = ["계란", "우유", "대두", "밀", "땅콩", "갑각류", "생선", "복숭아"];
const weekLabels = ["월", "화", "수", "목", "금", "토", "일"];
const mealBarClass: Record<MealType, string> = {
  breakfast: "orange",
  lunch: "mint",
  dinner: "green",
  snack: "coral",
};

const mealTypeRecordTimes: Record<MealType, string> = {
  breakfast: "08:00",
  lunch: "12:30",
  dinner: "18:30",
  snack: "15:30",
};

const mealCalorieRingColors: Record<MealType, string> = {
  breakfast: "#f59e0b",
  lunch: "#10b981",
  dinner: "#3182f6",
  snack: "#f97316",
};
const hiddenPreferenceLabels = new Set(["균형 건강식", "체지방 감량", "근력 운동식", "키토 식단"]);

function userFacingPreferences(values: string[]) {
  return values.filter((value) => value && !value.startsWith("channel:") && !hiddenPreferenceLabels.has(value));
}

function formatGram(value: number) {
  return Number(value).toLocaleString("ko-KR", { maximumFractionDigits: 1 });
}

function foodRecordMeta(food: Food) {
  return `${formatWon(food.priceKrw)} · ${formatKcal(food.caloriesKcal)} · 탄수 ${formatGram(food.carbsG)}g · 단백질 ${formatGram(food.proteinG)}g · 지방 ${formatGram(food.fatG)}g`;
}

function toStoredAuthSession(session: AuthSession) {
  return {
    userId: session.userId,
    email: session.email,
    displayName: session.displayName,
    profileComplete: session.profileComplete,
  };
}

function recommendationStatusLabel(reaction: RecommendationReaction | undefined, recorded: boolean) {
  if (recorded) return "기록 완료";
  if (reaction === "accepted") return "좋아요 반영됨";
  if (reaction === "skipped") return "오늘 건너뜀";
  return "선택한 후보";
}

function recommendationBurstLabel(type: Exclude<RecommendationMotion["type"], "selected">) {
  if (type === "accepted") return "좋아요 반영";
  if (type === "skipped") return "다음 후보";
  return "기록 완료";
}

function recommendationFitChips(recommendation: Recommendation, dashboard: DashboardSummary) {
  const chips: string[] = [];
  if (recommendation.totalPriceKrw <= dashboard.today.remainingBudgetKrw) chips.push("예산 안");
  if (recommendation.totalCaloriesKcal <= dashboard.today.remainingCaloriesKcal + 100) chips.push("칼로리 안");
  if (recommendation.totalProteinG >= 20) chips.push("단백질 보강");
  if (!recommendation.allergenWarnings?.length) chips.push("알레르기 제외");
  if (recommendation.preferenceMatches?.length) chips.push("선호 반영");
  return [...new Set(chips)].slice(0, 4);
}

function mealSequenceFor(mealType: MealType, todayMealCount: number) {
  if (mealType === "breakfast") return 1;
  if (mealType === "lunch") return 2;
  if (mealType === "dinner") return 3;
  if (mealType === "snack") return 4;
  return Math.min(Math.max(todayMealCount + 1, 1), 4);
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

function buildMealCalorieRing(meals: MealLog[], calorieTarget: number) {
  const totals = mealTypes.reduce(
    (acc, mealType) => ({ ...acc, [mealType]: 0 }),
    {} as Record<MealType, number>,
  );
  for (const meal of meals) {
    totals[meal.mealType] += meal.caloriesKcal;
  }

  const totalCalories = mealTypes.reduce((sum, mealType) => sum + totals[mealType], 0);
  const ratioBase = totalCalories > calorieTarget ? totalCalories : calorieTarget;
  let cursor = 0;
  const filledSegments: string[] = [];
  for (const mealType of mealTypes) {
    const ratio = Math.max(0, totals[mealType] / ratioBase);
    const next = Math.min(100, cursor + ratio * 100);
    if (next > cursor) {
      filledSegments.push(`${mealCalorieRingColors[mealType]} ${cursor.toFixed(2)}% ${next.toFixed(2)}%`);
    }
    cursor = next;
    if (cursor >= 100) break;
  }

  const rest = cursor < 100 ? `var(--color-progress-track) ${cursor.toFixed(2)}% 100%` : "";
  return `conic-gradient(${[...filledSegments, rest].filter(Boolean).join(", ")})`;
}

function macroTargetsFromCalories(calorieTarget: number) {
  return {
    carbsG: Math.max(1, Math.round((calorieTarget * 0.5) / 4)),
    proteinG: Math.max(1, Math.round((calorieTarget * 0.25) / 4)),
    fatG: Math.max(1, Math.round((calorieTarget * 0.25) / 9)),
  };
}

function goalCalorieDelta(goalType: GoalType) {
  if (goalType === "cut") return -300;
  if (goalType === "bulk") return 250;
  return 0;
}

function goalTargetCalories(profile: Pick<DashboardSummary["profile"], "tdeeKcal">, goalType: GoalType) {
  return Math.max(900, Math.round(profile.tdeeKcal + goalCalorieDelta(goalType)));
}

type MacroId = "carbs" | "protein" | "fat";
type MacroStatusTone = "low" | "fit" | "over";
type WeeklyPlanTickerTone = "stable" | "warning" | "attention" | "recovery";
type MacroSummaryItem = {
  id: MacroId;
  label: string;
  value: number;
  target: number;
  className: string;
  status: { label: string; tone: MacroStatusTone };
};
type WeeklyPlanTickerItem = {
  id: string;
  label: string;
  message: string;
  tone: WeeklyPlanTickerTone;
};

const macroImageSrc: Record<MacroId, Record<MacroStatusTone, string>> = {
  carbs: {
    low: "/Img/carbs-low.png",
    fit: "/Img/carbs-fit.png",
    over: "/Img/carbs-over.png",
  },
  protein: {
    low: "/Img/protein-low.png",
    fit: "/Img/protein-fit.png",
    over: "/Img/protein-over.png",
  },
  fat: {
    low: "/Img/fat-low.png",
    fit: "/Img/fat-fit.png",
    over: "/Img/fat-over.png",
  },
};

function macroStatus(value: number, target: number): { label: string; tone: MacroStatusTone } {
  const ratio = value / Math.max(target, 1);
  if (ratio > 1.18) return { label: "초과", tone: "over" };
  if (ratio < 0.82) return { label: "부족", tone: "low" };
  return { label: "적정", tone: "fit" };
}

function buildMacroSummaries(summary: Pick<NutritionSummary, "carbsG" | "proteinG" | "fatG">, calorieTarget: number, dayCount = 1): MacroSummaryItem[] {
  const targetMultiplier = Math.max(1, dayCount);
  const macroTargets = macroTargetsFromCalories(calorieTarget);
  const macroSummaryInputs: Array<Omit<MacroSummaryItem, "status">> = [
    {
      id: "carbs",
      label: "탄수화물",
      value: Math.round(summary.carbsG),
      target: macroTargets.carbsG * targetMultiplier,
      className: "carbs",
    },
    {
      id: "protein",
      label: "단백질",
      value: Math.round(summary.proteinG),
      target: macroTargets.proteinG * targetMultiplier,
      className: "protein",
    },
    {
      id: "fat",
      label: "지방",
      value: Math.round(summary.fatG),
      target: macroTargets.fatG * targetMultiplier,
      className: "fat",
    },
  ];
  return macroSummaryInputs.map((macro) => ({ ...macro, status: macroStatus(macro.value, macro.target) }));
}

function inclusiveDayCount(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 1;
  const diff = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  return Math.max(1, diff);
}

function macroTickerLabel(id: MacroId) {
  return {
    carbs: "탄수화물",
    protein: "단백질",
    fat: "지방",
  }[id];
}

function macroActionFoodLabel(id: MacroId) {
  return {
    carbs: "고구마·현미밥·통밀빵처럼 에너지를 채우는 메뉴",
    protein: "닭가슴살·계란·두부처럼 단백질을 채우는 메뉴",
    fat: "견과류·올리브오일처럼 지방을 보완하는 메뉴",
  }[id];
}

function formatMacroProgress(label: string, value: number, target: number) {
  return `${label} ${Math.round(value).toLocaleString("ko-KR")}/${Math.round(target).toLocaleString("ko-KR")}g`;
}

function buildWeeklyPlanTickerItems(dashboard: DashboardSummary): WeeklyPlanTickerItem[] {
  const weekly = dashboard.weeklyMeals;
  if (!weekly.mealCount) {
    return [
      {
        id: "weekly-empty",
        label: "이번 주 기록",
        tone: "attention",
        message: "이번 주 식단 기록이 아직 부족해요. 먹은 음식을 남기면 탄수화물, 단백질, 지방 중 무엇을 더 채워야 하는지 바로 알려드릴게요.",
      },
    ];
  }

  const dayCount = inclusiveDayCount(weekly.startDate, weekly.endDate);
  const targets = macroTargetsFromCalories(dashboard.profile.targetCaloriesKcal);
  const stats = [
    { id: "carbs" as const, value: weekly.carbsG, target: targets.carbsG * dayCount },
    { id: "protein" as const, value: weekly.proteinG, target: targets.proteinG * dayCount },
    { id: "fat" as const, value: weekly.fatG, target: targets.fatG * dayCount },
  ].map((item) => ({ ...item, ratio: item.value / Math.max(item.target, 1) }));
  const mostFilled = [...stats].sort((a, b) => b.ratio - a.ratio)[0];
  const mostLacking = [...stats].sort((a, b) => a.ratio - b.ratio)[0];
  const tone: WeeklyPlanTickerTone = mostLacking.ratio < 0.75 ? "attention" : mostLacking.ratio > 1.15 ? "warning" : "stable";
  const filledLabel = macroTickerLabel(mostFilled.id);
  const lackingLabel = macroTickerLabel(mostLacking.id);
  const lackingProgress = formatMacroProgress(lackingLabel, mostLacking.value, mostLacking.target);
  const message =
    mostLacking.ratio > 1.15
      ? `이번 주는 ${filledLabel} 섭취가 높은 편이에요. 다음 식사는 기름진 메뉴보다 담백한 메뉴로 균형을 맞춰보세요. (${lackingProgress})`
      : `이번 주는 ${filledLabel}을 가장 잘 채웠고 ${lackingLabel}이 부족해요. 다음 식사는 ${macroActionFoodLabel(mostLacking.id)}로 균형을 맞춰보세요. (${lackingProgress})`;

  return [
    {
      id: `weekly-macro-${mostFilled.id}-${mostLacking.id}`,
      label: "이번 주 기록",
      tone,
      message,
    },
  ];
}

function MacroImageList({ items }: { items: MacroSummaryItem[] }) {
  return (
    <div className="priority-macro-list">
      {items.map((macro) => (
        <article className={`priority-macro-item ${macro.className}`} key={macro.id}>
          <img src={macroImageSrc[macro.id][macro.status.tone]} alt={`${macro.label} ${macro.status.label}`} />
          <strong>{macro.label}</strong>
          <span>
            {macro.value}/{macro.target}g
          </span>
          <em className={macro.status.tone}>{macro.status.label}</em>
        </article>
      ))}
    </div>
  );
}

function estimateMealBudget(dashboard: DashboardSummary, mealType: MealType) {
  const mealSequence = mealSequenceFor(mealType, dashboard.today.mealCount);
  const remainingSlots = Math.max(1, 4 - mealSequence + 1);
  return Math.max(Math.round(dashboard.today.remainingBudgetKrw / remainingSlots), 0);
}

function estimateMealCalories(dashboard: DashboardSummary, mealType: MealType) {
  const mealSequence = mealSequenceFor(mealType, dashboard.today.mealCount);
  const remainingSlots = Math.max(1, 4 - mealSequence + 1);
  const remainingSlotCalories = Math.round(dashboard.today.remainingCaloriesKcal / remainingSlots);
  return Math.max(remainingSlotCalories, mealCalorieFloor(mealType, dashboard.profile.targetCaloriesKcal));
}

function recommendationCalorieLimitWarning() {
  return "오늘 하루 섭취 가능 칼로리를 모두 섭취했어요. 그래도 더 먹을 식단을 추천할게요.";
}

function normalizeMoneyInput(value: string) {
  return value.replace(/[^\d]/g, "");
}

function consumedAtForMealType(mealType: MealType, date = todayISO()) {
  return `${date}T${mealTypeRecordTimes[mealType]}`;
}

function findNextAvailableRecommendation(items: RecommendationViewModel[], skippedIds: Set<number>, currentId: number) {
  if (!items.length) return undefined;
  const currentIndex = Math.max(
    0,
    items.findIndex((item) => item.id === currentId),
  );
  for (let offset = 1; offset <= items.length; offset += 1) {
    const candidate = items[(currentIndex + offset) % items.length];
    if (candidate && !skippedIds.has(candidate.id)) return candidate;
  }
  return undefined;
}

function toLocalISODate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDashboardWeek(today: string) {
  const base = new Date(`${today}T00:00:00`);
  const mondayOffset = (base.getDay() + 6) % 7;
  return weekLabels.map((label, index) => {
    const date = new Date(base);
    date.setDate(base.getDate() - mondayOffset + index);
    const isoDate = toLocalISODate(date);
    return {
      label,
      isoDate,
      day: date.getDate(),
      selected: isoDate === today,
    };
  });
}

function weekDayIndexFromISO(date: string) {
  const parsed = new Date(`${date}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? 0 : (parsed.getDay() + 6) % 7;
}

function dateForWeekday(referenceDate: string, dayIndex: number) {
  const base = new Date(`${referenceDate}T00:00:00`);
  const mondayOffset = (base.getDay() + 6) % 7;
  const date = new Date(base);
  date.setDate(base.getDate() - mondayOffset + dayIndex);
  return toLocalISODate(date);
}

function SvgWeightChart({ points }: { points: Array<{ date: string; weightKg: number }> }) {
  if (points.length === 0) return <p className="empty-chart">그래프 없음</p>;

  const width = 320;
  const height = 156;
  const displayPoints = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const weights = displayPoints.map((point) => point.weightKg);
  const rawMin = Math.min(...weights);
  const rawMax = Math.max(...weights);
  const valuePadding = rawMax === rawMin ? 0.5 : Math.max((rawMax - rawMin) * 0.18, 0.2);
  const min = rawMin - valuePadding;
  const max = rawMax + valuePadding;
  const plot = { left: 34, right: 28, top: 30, bottom: 42 };
  const plotWidth = width - plot.left - plot.right;
  const plotHeight = height - plot.top - plot.bottom;
  const coords = displayPoints.map((point, index) => {
    const x = displayPoints.length === 1 ? width - plot.right : plot.left + (index / (displayPoints.length - 1)) * plotWidth;
    const ratio = (point.weightKg - min) / (max - min || 1);
    const y = plot.top + (1 - ratio) * plotHeight;
    return { ...point, x, y };
  });
  const linePoints = coords.map((point) => `${point.x},${point.y}`).join(" ");

  return (
    <svg className="react-svg-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="체중 변화 그래프">
      <line className="chart-grid-line" x1={plot.left} x2={width - plot.right} y1={plot.top} y2={plot.top} />
      <line className="chart-grid-line" x1={plot.left} x2={width - plot.right} y1={plot.top + plotHeight / 2} y2={plot.top + plotHeight / 2} />
      <line className="chart-grid-line" x1={plot.left} x2={width - plot.right} y1={plot.top + plotHeight} y2={plot.top + plotHeight} />
      {coords.length > 1 ? <polyline className="weight-chart-line" points={linePoints} /> : null}
      {coords.map((point, index) => (
        <g key={`${point.date}-${point.weightKg}-${index}`}>
          <circle cx={point.x} cy={point.y} r="5" />
          <text x={point.x} y={point.y - 10} textAnchor="middle">
            {point.weightKg.toFixed(1)}
          </text>
          <text x={point.x} y={height - 8} textAnchor="middle">
            {point.date.slice(5).replace("-", ".")}
          </text>
        </g>
      ))}
    </svg>
  );
}

function MiniWeightSparkline({ points }: { points: Array<{ date: string; weightKg: number }> }) {
  const displayPoints = points.slice(-7);
  if (!displayPoints.length) return <span className="home-weight-sparkline empty" aria-hidden="true" />;

  const width = 154;
  const height = 62;
  const min = Math.min(...displayPoints.map((point) => point.weightKg)) - 0.25;
  const max = Math.max(...displayPoints.map((point) => point.weightKg)) + 0.25;
  const coords = displayPoints.map((point, index) => {
    const x = displayPoints.length === 1 ? width - 16 : 12 + (index / (displayPoints.length - 1)) * (width - 28);
    const y = 10 + (1 - (point.weightKg - min) / (max - min || 1)) * 30;
    return { ...point, x, y };
  });
  const path = coords.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
  const lastPoint = coords[coords.length - 1];

  return (
    <svg className="home-weight-sparkline" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="최근 체중 변화">
      <path className="sparkline-baseline" d={`M 10 ${height - 17} H ${width - 10}`} />
      <path className="sparkline-path" d={path} />
      <circle className="sparkline-end" cx={lastPoint.x} cy={lastPoint.y} r="4.5" />
      <text x="12" y={height - 4}>
        최근 {shortDate(lastPoint.date)}
      </text>
    </svg>
  );
}

function _DashboardMealRows({
  meals,
  onDelete,
  onRecordMeal,
}: {
  meals: MealLog[];
  onDelete: (meal: MealLog) => void;
  onRecordMeal?: () => void;
}) {
  if (meals.length === 0) {
    return (
      <article className="dashboard-empty-card">
        <span className="dashboard-empty-badge" aria-hidden="true">
          <FaIcon name="cutlery" size={18} />
        </span>
        <div>
          <strong>오늘 식단을 아직 기록하지 않았어요</strong>
          <span>먹은 음식을 남기면 남은 칼로리와 이번 주 식비가 바로 계산돼요.</span>
        </div>
        {onRecordMeal ? (
          <button type="button" onClick={onRecordMeal}>
            식단 기록
          </button>
        ) : null}
      </article>
    );
  }

  return (
    <div className="dashboard-list">
      {meals.slice(0, 4).map((meal) => (
        <article className="dashboard-row" key={meal.id}>
          <span className="dashboard-row-icon" aria-hidden="true">
            {meal.mealType === "breakfast" ? "B" : meal.mealType === "lunch" ? "L" : meal.mealType === "dinner" ? "D" : "S"}
          </span>
          <div>
            <strong>{meal.food.name}</strong>
            <span>
              {mealTypeLabel(meal.mealType)} · {meal.quantityLabel}
            </span>
          </div>
          <div className="dashboard-row-meta">
            <b>{Math.round(meal.caloriesKcal)}kcal</b>
            <button type="button" onClick={() => onDelete(meal)}>
              삭제
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}

function shortDate(date: string) {
  return date.slice(5).replace("-", ".");
}

function bodyMetricText(value: number | null | undefined, unit: string) {
  return value === null || value === undefined ? "-" : `${value.toFixed(1)}${unit}`;
}

function _WeightTrendCard({
  dashboard,
  bodyRecords,
  range,
  onRangeChange,
  onRecord,
}: {
  dashboard: DashboardSummary;
  bodyRecords: WeightRecord[];
  range: WeightRange;
  onRangeChange: (range: WeightRange) => void;
  onRecord: () => void;
}) {
  const points = range === "week" ? dashboard.weight.chart.slice(-7) : dashboard.weight.chart;
  const latestBodyRecord = bodyRecords.find((record) => record.bodyFatPercent !== null || record.skeletalMuscleKg !== null);
  const previousDelta = dashboard.weight.changeFromPreviousKg;
  const deltaText = previousDelta === null ? "첫 기록" : `${previousDelta > 0 ? "+" : ""}${previousDelta.toFixed(1)}kg`;
  const startDelta = `${dashboard.weight.changeFromStartKg > 0 ? "+" : ""}${dashboard.weight.changeFromStartKg.toFixed(1)}kg`;

  return (
    <section className="weight-trend-card" aria-label="나의 변화">
      <header className="service-section-head">
        <div>
          <span>나의 변화</span>
          <h2>몸무게 변화</h2>
        </div>
        <div className="trend-range" role="tablist" aria-label="체중 기간">
          <button className={range === "week" ? "active" : ""} type="button" onClick={() => onRangeChange("week")}>
            주간
          </button>
          <button className={range === "month" ? "active" : ""} type="button" onClick={() => onRangeChange("month")}>
            월간
          </button>
        </div>
      </header>

      <div className="weight-main-row">
        <div>
          <span>현재 몸무게</span>
          <strong>
            {dashboard.weight.currentWeightKg.toFixed(1)}
            <small>kg</small>
          </strong>
          <p>최근 기록일 {dashboard.weight.latestRecordedAt?.slice(0, 10) ?? "-"}</p>
        </div>
        <button type="button" onClick={onRecord}>
          기록
        </button>
      </div>

      <div className="weight-stat-grid">
        <article>
          <span>목표</span>
          <strong>{dashboard.weight.targetWeightKg.toFixed(1)}kg</strong>
        </article>
        <article>
          <span>최근 변화</span>
          <strong>{deltaText}</strong>
        </article>
        <article>
          <span>시작 대비</span>
          <strong>{startDelta}</strong>
        </article>
      </div>

      <div className="trend-chart">
        <SvgWeightChart points={points} />
      </div>

      <div className="body-composition-summary">
        <span>체성분 최근 기록</span>
        <strong>
          체지방률 {bodyMetricText(latestBodyRecord?.bodyFatPercent, "%")} · 골격근량 {bodyMetricText(latestBodyRecord?.skeletalMuscleKg, "kg")}
        </strong>
      </div>
    </section>
  );
}

function _HomeMealBridge({
  dashboard,
  onOpenPeriod,
}: {
  dashboard: DashboardSummary;
  onOpenPeriod: (period: MealPeriod) => void;
}) {
  return (
    <section className="meal-bridge-card" aria-label="식단 기록 흐름" data-aos="fade-up" data-aos-delay="70">
      <header className="service-section-head">
        <div>
          <span>오늘 식단</span>
          <h2>최근 기록과 이어서 보기</h2>
        </div>
      </header>
      <div className="meal-bridge-actions">
        <button type="button" onClick={() => onOpenPeriod("today")}>
          <strong>{dashboard.today.meals.length}</strong>
          <span>오늘 먹은 음식</span>
        </button>
        <button type="button" onClick={() => onOpenPeriod("recent")}>
          <strong>{dashboard.weeklyMeals.mealCount}</strong>
          <span>최근 기록</span>
        </button>
        <button type="button" onClick={() => onOpenPeriod("week")}>
          <strong>{formatKcal(dashboard.weeklyMeals.caloriesKcal)}</strong>
          <span>주간 섭취량</span>
        </button>
      </div>
    </section>
  );
}

function HomePriorityAction({
  dashboard,
  onRecordMeal,
  onViewMealHistory,
  onViewRecommendation,
  onRecordWeight,
}: {
  dashboard: DashboardSummary;
  onRecordMeal: () => void;
  onViewMealHistory: () => void;
  onViewRecommendation: () => void;
  onRecordWeight: () => void;
}) {
  const hasMeals = dashboard.today.meals.length > 0;
  const overCalories = dashboard.today.remainingCaloriesKcal <= 0;
  const calorieTarget = Math.max(1, dashboard.profile.targetCaloriesKcal);
  const calorieProgress = Math.round(Math.min(Math.max((dashboard.today.caloriesKcal / calorieTarget) * 100, 0), 100));
  const macroSummaries = buildMacroSummaries(dashboard.today, calorieTarget);
  const scoreStyle = {
    "--home-score-progress": `${calorieProgress}%`,
    "--home-meal-ring": buildMealCalorieRing(dashboard.today.meals, calorieTarget),
  } as CSSProperties;
  const action = !hasMeals
    ? {
        label: "식단 기록하기",
        title: "첫 식사를 남기면 오늘 기준이 계산돼요",
        helper: "먹은 음식과 쓴 금액을 남기면 추천 기준이 바로 바뀝니다.",
        onClick: onRecordMeal,
      }
    : overCalories
      ? {
          label: "체중 기록하기",
          title: "오늘 식단은 충분히 채워졌어요",
          helper: "체중 기록으로 오늘 흐름을 가볍게 마무리해요.",
          onClick: onRecordWeight,
        }
      : {
          label: "추천 보기",
          title: "남은 예산 안에서 다음 끼니를 고를 수 있어요",
          helper: `${formatKcal(dashboard.today.remainingCaloriesKcal)} 안에서 지출까지 맞춘 후보를 봅니다.`,
          onClick: onViewRecommendation,
        };

  return (
    <section className="home-priority-action" aria-label="오늘 가장 중요한 행동" data-aos="fade-up" data-aos-delay="20">
      <div className="priority-report-ring" style={scoreStyle} aria-label={`오늘 섭취 진행률 ${calorieProgress}%`}>
        <span>
          <b>{calorieProgress}</b>
          <small>%</small>
        </span>
      </div>
      <div className="priority-copy">
        <span>{hasMeals ? `${dashboard.today.mealCount}끼 기록` : "오늘 식단 리포트"}</span>
        <strong>{action.title}</strong>
        <div className="priority-metric-row" aria-label="오늘 핵심 숫자">
          <em>
            <b>{formatWon(dashboard.today.remainingBudgetKrw)}</b>
            남은 식비
          </em>
          <em>
            <b>{formatKcal(dashboard.today.remainingCaloriesKcal)}</b>
            남은 kcal
          </em>
        </div>
        <p>{action.helper}</p>
        <div className="priority-action-buttons">
          <button type="button" onClick={action.onClick}>
            {action.label}
          </button>
          <button className="secondary" type="button" onClick={onViewMealHistory}>
            식단 기록 보기
          </button>
        </div>
      </div>
      <div className="priority-macro-panel" aria-label="오늘 탄단지 섭취">
        <header>
          <span>섭취칼로리</span>
          <strong>
            {Math.round(dashboard.today.caloriesKcal).toLocaleString("ko-KR")}
            <small>/{calorieTarget.toLocaleString("ko-KR")}Kcal</small>
          </strong>
        </header>
        <MacroImageList items={macroSummaries} />
      </div>
    </section>
  );
}

function HomeOverviewCards({
  dashboard,
  calorieProgress,
  budgetProgress,
  onOpenDiet,
  onOpenWeight,
  onOpenBudget,
  onOpenRecommendation,
}: {
  dashboard: DashboardSummary;
  calorieProgress: number;
  budgetProgress: number;
  onOpenDiet: () => void;
  onOpenWeight: () => void;
  onOpenBudget: () => void;
  onOpenRecommendation: () => void;
}) {
  const cards: Array<{
    key: "diet" | "recommend" | "budget" | "weight";
    icon: ReactNode;
    eyebrow: string;
    label: string;
    value: string;
    helper?: string;
    progress?: number;
    action?: string;
    sparkline?: ReactNode;
    onClick: () => void;
  }> = [
    {
      key: "diet",
      icon: <FaIcon name="cutlery" size={18} />,
      eyebrow: "기록",
      label: "식단 기록",
      value: `${dashboard.today.mealCount}끼`,
      helper: `${formatKcal(dashboard.today.remainingCaloriesKcal)} 남음`,
      progress: calorieProgress,
      action: "추가",
      onClick: onOpenDiet,
    },
    {
      key: "recommend",
      icon: <FaIcon name="magic" size={18} />,
      eyebrow: "추천",
      label: "예산 추천",
      value: formatWon(estimateMealBudget(dashboard, "dinner")),
      helper: "이번 끼니 기준",
      progress: 64,
      action: "보기",
      onClick: onOpenRecommendation,
    },
    {
      key: "budget",
      icon: <FaIcon name="money" size={18} />,
      eyebrow: "예산",
      label: "남은 식비",
      value: formatWon(dashboard.today.remainingBudgetKrw),
      helper: `${formatWon(dashboard.weeklyMeals.spentMoneyKrw)} 사용`,
      progress: budgetProgress,
      action: "변경",
      onClick: onOpenBudget,
    },
    {
      key: "weight",
      icon: <FaIcon name="balance-scale" size={18} />,
      eyebrow: "신체",
      label: "몸무게",
      value: `${dashboard.weight.currentWeightKg.toFixed(1)}kg`,
      sparkline: <MiniWeightSparkline points={dashboard.weight.chart} />,
      onClick: onOpenWeight,
    },
  ];

  return (
    <section className="home-overview-cards" aria-label="홈 기능 카드" data-aos="fade-up" data-aos-delay="60">
      {cards.map((card) => (
        <button className={`home-overview-card ${card.key}`} key={card.key} type="button" onClick={card.onClick}>
          <span className="home-overview-icon" aria-hidden="true">
            {card.icon}
          </span>
          <span className="home-overview-eyebrow">{card.eyebrow}</span>
          <span className="home-overview-label">{card.label}</span>
          <strong>{card.value}</strong>
          {card.helper ? <small>{card.helper}</small> : null}
          {card.sparkline ?? null}
          {card.progress !== undefined ? (
            <span className="home-overview-progress" aria-hidden="true">
              <i style={{ width: `${Math.min(Math.max(card.progress, 0), 100)}%` }} />
            </span>
          ) : null}
          {card.action ? <em>{card.action}</em> : null}
        </button>
      ))}
    </section>
  );
}

function WeeklyPlanTicker({
  dashboard,
}: {
  dashboard: DashboardSummary;
}) {
  const tickerItems = useMemo(() => buildWeeklyPlanTickerItems(dashboard), [dashboard]);

  return (
    <section className="weekly-plan-ticker" aria-label="주간 계획 요약 리포트" data-aos="fade-up" data-aos-delay="75">
      <header className="weekly-plan-ticker-head">
        <span>주간 식단 리포트</span>
        <strong>이번 주 상태</strong>
      </header>
      <div className="weekly-plan-ticker-window">
        <div className="weekly-plan-ticker-track" aria-live="polite">
          {[0, 1].map((loopIndex) => (
            <div className="weekly-plan-ticker-group" key={loopIndex} aria-hidden={loopIndex > 0}>
              {tickerItems.map((item) => (
                <article className={`weekly-plan-ticker-item ${item.tone}`} key={`${item.id}-${loopIndex}`}>
                  <b>{item.label}</b>
                  <p>{item.message}</p>
                </article>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HomeRecommendationPreviewCard({
  dashboard,
  recommendation,
  onOpenMealHistory,
  onOpenRecommendation,
}: {
  dashboard: DashboardSummary;
  recommendation?: Recommendation;
  onOpenMealHistory: () => void;
  onOpenRecommendation: () => void;
}) {
  if (!recommendation) return null;
  const fitChips = recommendationFitChips(recommendation, dashboard);

  return (
    <section className="dashboard-section home-recommendation-section" data-aos="fade-up" data-aos-delay="90">
      <header className="service-section-head">
        <div>
          <span>오늘 추천 식사</span>
          <h2>오늘은 어떤 식단을 할까요?</h2>
        </div>
        <div className="home-recommendation-head-actions">
          <button type="button" onClick={onOpenRecommendation}>
            추천 보기
          </button>
          <button type="button" onClick={onOpenMealHistory}>
            식단 기록
          </button>
        </div>
      </header>
      <button className="home-recommendation-preview" type="button" onClick={onOpenRecommendation}>
        <span className="home-recommendation-topline">
          <span className="choice-index">1</span>
          <span className="choice-meta">
            {mealTypeLabel(recommendation.mealType)}
          </span>
        </span>
        <strong>{recommendation.name}</strong>
        <em>
          {formatWon(recommendation.totalPriceKrw)} · {formatKcal(recommendation.totalCaloriesKcal)}
        </em>
        <span className="home-recommendation-reasons" aria-label="추천 이유">
          {fitChips.map((chip) => (
            <small key={chip}>{chip}</small>
          ))}
        </span>
        <span className="home-recommendation-nutrition">
          <small>
            단백질 <b>{recommendation.totalProteinG}g</b>
          </small>
          <small>
            탄수 <b>{recommendation.totalCarbsG}g</b>
          </small>
          <small>
            지방 <b>{recommendation.totalFatG}g</b>
          </small>
        </span>
        <b className="home-recommendation-cta">후보 3개 보기</b>
      </button>
    </section>
  );
}

function MealPeriodPanel({
  dashboard,
  summary,
  period,
  periodStart,
  periodEnd,
  loading,
  hiddenMealIds,
  onPeriodChange,
  onStartChange,
  onEndChange,
  onDelete,
}: {
  dashboard: DashboardSummary;
  summary: PeriodMealSummary | null;
  period: MealPeriod;
  periodStart: string;
  periodEnd: string;
  loading: boolean;
  hiddenMealIds?: Set<number>;
  onPeriodChange: (period: MealPeriod) => void;
  onStartChange: (date: string) => void;
  onEndChange: (date: string) => void;
  onDelete: (meal: MealLog) => void;
}) {
  const [dateFilterOpen, setDateFilterOpen] = useState(false);
  const fallbackSummary: PeriodMealSummary = {
    startDate: todayISO(),
    endDate: todayISO(),
    caloriesKcal: dashboard.today.caloriesKcal,
    proteinG: dashboard.today.proteinG,
    fatG: dashboard.today.fatG,
    carbsG: dashboard.today.carbsG,
    spentMoneyKrw: dashboard.today.spentMoneyKrw,
    mealCount: dashboard.today.mealCount,
    byDate: [
      {
        date: todayISO(),
        summary: dashboard.today,
        meals: dashboard.today.meals,
      },
    ],
    pattern: {
      mostFrequentMealType: dashboard.today.meals[0]?.mealType ?? null,
      averageCaloriesPerDay: dashboard.today.caloriesKcal,
      averageSpendPerDay: dashboard.today.spentMoneyKrw,
    },
  };
  const activeSummary = summary ?? fallbackSummary;
  const visibleByDate = activeSummary.byDate.map((day) => {
    const meals = day.meals.filter((meal) => !hiddenMealIds?.has(meal.id));
    return {
      ...day,
      meals,
      summary: {
        ...day.summary,
        caloriesKcal: meals.reduce((sum, meal) => sum + meal.caloriesKcal, 0),
        proteinG: meals.reduce((sum, meal) => sum + meal.proteinG, 0),
        fatG: meals.reduce((sum, meal) => sum + meal.fatG, 0),
        carbsG: meals.reduce((sum, meal) => sum + meal.carbsG, 0),
        spentMoneyKrw: meals.reduce((sum, meal) => sum + meal.spentMoneyKrw, 0),
        mealCount: meals.length,
      },
    };
  });
  const visibleMeals = visibleByDate.flatMap((day) => day.meals);
  const visibleCalories = visibleMeals.reduce((sum, meal) => sum + meal.caloriesKcal, 0);
  const visibleSpend = visibleMeals.reduce((sum, meal) => sum + meal.spentMoneyKrw, 0);
  const visibleDayCount = Math.max(1, visibleByDate.filter((day) => day.meals.length > 0).length);
  const visibleMealTypeCounts = visibleMeals.reduce<Partial<Record<MealType, number>>>((counts, meal) => {
    counts[meal.mealType] = (counts[meal.mealType] ?? 0) + 1;
    return counts;
  }, {});
  const mostFrequentMealType =
    (Object.entries(visibleMealTypeCounts).sort((left, right) => right[1] - left[1])[0]?.[0] as MealType | undefined) ?? null;
  const displaySummary = {
    ...activeSummary,
    byDate: visibleByDate,
    caloriesKcal: visibleCalories,
    proteinG: visibleMeals.reduce((sum, meal) => sum + meal.proteinG, 0),
    fatG: visibleMeals.reduce((sum, meal) => sum + meal.fatG, 0),
    carbsG: visibleMeals.reduce((sum, meal) => sum + meal.carbsG, 0),
    spentMoneyKrw: visibleSpend,
    mealCount: visibleMeals.length,
    pattern: {
      ...activeSummary.pattern,
      mostFrequentMealType,
      averageCaloriesPerDay: visibleCalories / visibleDayCount,
      averageSpendPerDay: visibleSpend / visibleDayCount,
    },
  };
  const selectedDayCount = inclusiveDayCount(periodStart, periodEnd);
  const periodMacroSummaries = buildMacroSummaries(displaySummary, dashboard.profile.targetCaloriesKcal, selectedDayCount);
  const periodMacroTargetLabel = selectedDayCount === 1 ? "하루 기준" : `${selectedDayCount}일 기준`;
  const daysWithMeals = displaySummary.byDate.filter((day) => day.meals.length > 0);
  const recentDays = period === "recent" ? daysWithMeals.slice().reverse().slice(0, 5) : daysWithMeals;
  const dateRangeLabel = `${shortDate(periodStart)}-${shortDate(periodEnd)}`;

  return (
    <section className="meal-period-panel" aria-label="기간별 식단 조회">
      <header className="service-section-head">
        <div>
          <span>식단 기록 조회</span>
          <h2>언제 무엇을 먹었는지</h2>
        </div>
        <div className="meal-period-tools">
          {loading ? <em>불러오는 중</em> : null}
          <button type="button" aria-expanded={dateFilterOpen} onClick={() => setDateFilterOpen((current) => !current)}>
            <FaIcon name="calendar-o" size={16} />
            <span>{dateRangeLabel}</span>
          </button>
        </div>
      </header>

      {dateFilterOpen ? (
      <div className="meal-date-filter-layer open">
        <button className="meal-date-filter-backdrop" type="button" aria-label="날짜 필터 닫기" onClick={() => setDateFilterOpen(false)} />
        <section className="meal-date-filter-sheet" role="dialog" aria-modal="true" aria-label="식단 조회 필터">
          <span className="sheet-handle" aria-hidden="true" />
          <header>
            <div>
              <span>식단 조회</span>
              <h3>기간 선택</h3>
            </div>
            <button type="button" aria-label="닫기" onClick={() => setDateFilterOpen(false)}>
              <FaIcon name="times" size={20} />
            </button>
          </header>
          <div className="meal-period-tabs" role="tablist" aria-label="식단 조회 기간">
            <button
              className={period === "today" ? "active" : ""}
              type="button"
              onClick={() => {
                onPeriodChange("today");
                setDateFilterOpen(false);
              }}
            >
              오늘
            </button>
            <button
              className={period === "week" ? "active" : ""}
              type="button"
              onClick={() => {
                onPeriodChange("week");
                setDateFilterOpen(false);
              }}
            >
              이번 주
            </button>
            <button
              className={period === "recent" ? "active" : ""}
              type="button"
              onClick={() => {
                onPeriodChange("recent");
                setDateFilterOpen(false);
              }}
            >
              최근 기록
            </button>
          </div>
          <div className="date-filter-row">
            <label>
              시작
              <input type="date" value={periodStart} onChange={(event) => onStartChange(event.target.value)} />
            </label>
            <label>
              종료
              <input type="date" value={periodEnd} onChange={(event) => onEndChange(event.target.value)} />
            </label>
          </div>
        </section>
      </div>
      ) : null}

      <div className="period-summary-grid">
        <article>
          <span>총 섭취량</span>
          <strong>{formatKcal(displaySummary.caloriesKcal)}</strong>
        </article>
        <article>
          <span>총 식비</span>
          <strong>{formatWon(displaySummary.spentMoneyKrw)}</strong>
        </article>
        <article>
          <span>하루 평균</span>
          <strong>{formatKcal(displaySummary.pattern.averageCaloriesPerDay)}</strong>
        </article>
      </div>

      <div className="period-macro-panel" aria-label="선택 기간 탄단지 섭취">
        <header>
          <span>탄단지 균형</span>
          <strong>{periodMacroTargetLabel}</strong>
        </header>
        <MacroImageList items={periodMacroSummaries} />
      </div>

      <div className="meal-pattern-note">
        {displaySummary.pattern.mostFrequentMealType ? (
          <span>{mealTypeLabel(displaySummary.pattern.mostFrequentMealType)} 기록이 가장 많아요.</span>
        ) : (
          <span>기간 내 식단 패턴을 아직 계산할 기록이 부족해요.</span>
        )}
      </div>

      <div className="daily-meal-list">
        {recentDays.length ? (
          recentDays.map((day) => (
            <article className="daily-meal-card" key={day.date}>
              <header>
                <strong>{period === "today" ? "오늘" : shortDate(day.date)}</strong>
                <span>
                  {day.summary.mealCount}개 · {formatKcal(day.summary.caloriesKcal)}
                </span>
              </header>
              <div>
                {day.meals.map((meal) => (
                  <div className="daily-meal-row" key={meal.id}>
                    <span>{mealTypeLabel(meal.mealType)}</span>
                    <strong>{meal.food.name}</strong>
                    <em>{formatKcal(meal.caloriesKcal)}</em>
                    <button type="button" onClick={() => onDelete(meal)}>
                      삭제
                    </button>
                  </div>
                ))}
              </div>
            </article>
          ))
        ) : (
          <p className="mvp-empty">선택한 기간에는 식단 기록이 없어요.</p>
        )}
      </div>
    </section>
  );
}

function RecoveryTaskList({
  completedPlans,
  tasks: serverTasks,
  onToggle,
}: {
  completedPlans: Set<string>;
  tasks?: Array<{ id: string; title: string; helper: string; completed?: boolean }>;
  onToggle: (planId: string, label: string) => void;
}) {
  const tasks = serverTasks?.map((task) => ({ id: task.id, label: task.title, helper: task.helper, completed: task.completed ?? false })) ?? [
    { id: "no-flour", label: "밀가루 안 먹기", helper: "오늘 회복 루틴", completed: false },
    { id: "water-1-2", label: "물 1.2L 이상 마시기", helper: "수분 보충", completed: false },
    { id: "walk-10", label: "가벼운 산책 10분", helper: "식후 회복 루틴", completed: false },
  ];
  const doneCount = tasks.filter((task) => task.completed || completedPlans.has(task.id)).length;
  const progress = Math.round((doneCount / tasks.length) * 100);
  const progressLabel = doneCount === tasks.length ? "완료" : doneCount === 0 ? "시작 전" : `${doneCount}/${tasks.length} 진행`;
  const orderedTasks = [...tasks].sort((left, right) => Number(left.completed || completedPlans.has(left.id)) - Number(right.completed || completedPlans.has(right.id)));

  return (
    <article className="recover-todo-card" data-aos="fade-up" data-aos-delay="40">
      <header>
        <div>
          <span className="todo-icon" aria-hidden="true" />
          <div>
            <span>회복 체크리스트</span>
            <h2>오늘의 할 일</h2>
          </div>
        </div>
        <strong>{progressLabel}</strong>
      </header>
      <div className="todo-progress" aria-label={`회복 루틴 ${progress}% 완료`}>
        <i style={{ width: `${progress}%` }} />
      </div>
      <p className="todo-summary">
        {doneCount}개 완료 · 남은 {Math.max(tasks.length - doneCount, 0)}개
      </p>
      <div className="todo-list">
        {orderedTasks.map((task) => {
          const done = task.completed || completedPlans.has(task.id);
          return (
            <button
              className={`todo-row ${done ? "done" : ""}`}
              key={task.id}
              type="button"
              data-task-id={task.id}
              data-label={task.label}
              title={`${task.label} · ${task.helper}`}
              onClick={() => onToggle(task.id, task.label)}
            >
              <span className="todo-check" aria-hidden="true" />
              <span className="todo-copy">
                <strong>{task.label}</strong>
                <em>{task.helper}</em>
              </span>
              <b>{done ? "완료" : "체크"}</b>
            </button>
          );
        })}
      </div>
    </article>
  );
}

function RecommendationList({
  items,
  onRecord,
  onFeedback,
  feedbackById,
  recordedIds,
}: {
  items: RecommendationViewModel[];
  onRecord: (recommendation: Recommendation) => void;
  onFeedback: (recommendation: Recommendation, feedback: RecommendationReaction) => void;
  feedbackById: Partial<Record<number, RecommendationReaction>>;
  recordedIds: Set<number>;
}) {
  return (
    <div className="recommendation-card-list">
      {items.map((item) => {
        const reaction = feedbackById[item.id];
        const recorded = recordedIds.has(item.id);
        return (
          <article className={`recommendation-service-card ${recorded || reaction ? "has-response" : ""}`} key={item.id}>
            <header>
              <div>
                <span>{item.subtitle}</span>
                <h2>{item.title}</h2>
              </div>
              <strong>{item.meta}</strong>
            </header>
            <p>{item.reason}</p>
            <div className="recommendation-fit">{item.goalFit}</div>
            <div className="nutrition-pills">
              {item.nutrition.map((nutrition) => (
                <span key={nutrition.label}>
                  {nutrition.label} <b>{nutrition.value}</b>
                </span>
              ))}
            </div>
            <div className="recommendation-card-footer">
              <div>
                {item.tags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
              <div className="recommendation-feedback-actions">
                <span className="recommendation-response-chip">{recommendationStatusLabel(reaction, recorded)}</span>
                <button className={reaction === "skipped" ? "active negative" : ""} type="button" aria-pressed={reaction === "skipped"} onClick={() => onFeedback(item.source, "skipped")}>
                  별로
                </button>
                <button className={reaction === "accepted" ? "active positive" : ""} type="button" aria-pressed={reaction === "accepted"} onClick={() => onFeedback(item.source, "accepted")}>
                  좋아요
                </button>
                <button className={recorded ? "active logged" : ""} type="button" onClick={() => onRecord(item.source)}>
                  {recorded ? "기록됨" : "기록"}
                </button>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function RecommendationDrawCards({
  items,
  selectedId,
  onSelect,
  onRecord,
  onFeedback,
  feedbackById,
  recordedIds,
  skippedIds,
  motion,
}: {
  items: RecommendationViewModel[];
  selectedId: number | null;
  onSelect: (recommendation: Recommendation) => void;
  onRecord: (recommendation: Recommendation) => void;
  onFeedback: (recommendation: Recommendation, feedback: RecommendationReaction) => void;
  feedbackById: Partial<Record<number, RecommendationReaction>>;
  recordedIds: Set<number>;
  skippedIds: Set<number>;
  motion: RecommendationMotion | null;
}) {
  if (!items.length) return null;
  const selected = selectedId === null ? null : items.find((item) => item.id === selectedId) ?? null;
  const visibleItems = items;
  const selectedIndex = selected ? Math.max(0, visibleItems.findIndex((item) => item.id === selected.id)) : 0;
  type DrawCardSlot =
    | { item: RecommendationViewModel; originalIndex: number; placeholder: false }
    | { item: null; slotIndex: number; placeholder: true };
  const makeActualSlot = (item: RecommendationViewModel): DrawCardSlot => ({
    item,
    originalIndex: Math.max(0, visibleItems.findIndex((visibleItem) => visibleItem.id === item.id)),
    placeholder: false,
  });
  const makePlaceholderSlot = (slotIndex: number): DrawCardSlot => ({ item: null, slotIndex, placeholder: true });
  const drawItems: DrawCardSlot[] = (() => {
    if (selected && visibleItems.length >= 3) {
      return [(selectedIndex + visibleItems.length - 1) % visibleItems.length, selectedIndex, (selectedIndex + 1) % visibleItems.length].map((index) => ({
        item: visibleItems[index],
        originalIndex: index,
        placeholder: false,
      }));
    }
    if (selected && visibleItems.length === 2) {
      const otherItem = visibleItems.find((item) => item.id !== selected.id);
      return [otherItem ? makeActualSlot(otherItem) : makePlaceholderSlot(1), makeActualSlot(selected), makePlaceholderSlot(3)];
    }
    if (selected && visibleItems.length === 1) {
      return [makePlaceholderSlot(1), makeActualSlot(selected), makePlaceholderSlot(3)];
    }
    const slots = visibleItems.slice(0, 3).map(makeActualSlot);
    while (slots.length < 3) {
      slots.push(makePlaceholderSlot(slots.length + 1));
    }
    return slots;
  })();
  return (
    <div className="choice-card-strip" role="list">
      {drawItems.map((slot, slotPosition) => {
        if (slot.placeholder) {
          return (
            <article className="choice-recommendation-card muted placeholder-card" key={`placeholder-${slotPosition}`} role="listitem">
              <button className="choice-card-main" type="button" disabled aria-pressed="false">
                <span className="choice-index">{slot.slotIndex}</span>
                <span className="choice-meta">후보 준비 중</span>
                <strong>추천 기준을 바꾸면 후보가 채워져요</strong>
              </button>
            </article>
          );
        }
        const { item, originalIndex } = slot;
        const reaction = feedbackById[item.id];
        const recorded = recordedIds.has(item.id);
        const skippedToday = skippedIds.has(item.id);
        const active = selected !== null && item.id === selected.id;
        const motionType = motion?.candidateId === item.id ? motion.type : null;
        const slotName = slotPosition === 0 ? "left" : slotPosition === 1 ? "center" : "right";
        return (
          <article
            className={`choice-recommendation-card slot-${slotName} ${active ? "active" : "muted"} ${skippedToday ? "today-skipped" : ""} ${recorded || reaction ? "has-response" : ""} ${motionType ? `motion-${motionType}` : ""}`}
            key={`${item.id}-${motionType === "selected" ? motion?.nonce : "stable"}`}
            role="listitem"
          >
            {motion?.candidateId === item.id && motionType && motionType !== "selected" ? (
              <div className={`recommendation-burst ${motionType}`} key={motion.nonce} aria-live="polite">
                {motionType === "accepted" ? <FaIcon name="thumbs-up" size={18} /> : null}
                {motionType === "skipped" ? <FaIcon name="thumbs-down" size={18} /> : null}
                {motionType === "logged" ? <FaIcon name="cutlery" size={18} /> : null}
                <strong>{recommendationBurstLabel(motionType)}</strong>
              </div>
            ) : null}
            <button className="choice-card-main" type="button" disabled={skippedToday} onClick={() => onSelect(item.source)} aria-pressed={active} title={item.title}>
              <span className="choice-index">{originalIndex + 1}</span>
              <span className="choice-meta">{item.subtitle}</span>
              <strong>{item.title}</strong>
              <em>{item.meta}</em>
              <p>{item.reason}</p>
            </button>
            {!active ? <span className="choice-card-peek" aria-hidden="true">{item.title}</span> : null}
            <div className="choice-card-nutrition">
              {item.nutrition.slice(0, 3).map((nutrition) => (
                <span key={nutrition.label}>
                  {nutrition.label} <b>{nutrition.value}</b>
                </span>
              ))}
            </div>
            <div className="choice-card-actions">
              <span className="recommendation-response-chip">{recommendationStatusLabel(reaction, recorded)}</span>
              <button className={reaction === "skipped" ? "active negative" : ""} type="button" aria-pressed={reaction === "skipped"} onClick={() => onFeedback(item.source, "skipped")}>
                별로
              </button>
              <button className={reaction === "accepted" ? "active positive" : ""} type="button" aria-pressed={reaction === "accepted"} onClick={() => onFeedback(item.source, "accepted")}>
                좋아요
              </button>
              <button className={recorded ? "active logged" : ""} type="button" onClick={() => onRecord(item.source)}>
                {recorded ? "기록됨" : "기록"}
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function RecommendationChoicePanel({
  items,
  selectedId,
  dashboard,
  loading,
  hasRequested,
  panelRef,
  onSelect,
  onRecord,
  onFeedback,
  feedbackById,
  recordedIds,
  skippedIds,
  motion,
  aiExplanation,
  aiExplanationLoading,
  onExplain,
}: {
  items: RecommendationViewModel[];
  selectedId: number | null;
  dashboard: DashboardSummary;
  loading: boolean;
  hasRequested: boolean;
  panelRef?: Ref<HTMLElement>;
  onSelect: (recommendation: Recommendation) => void;
  onRecord: (recommendation: Recommendation) => void;
  onFeedback: (recommendation: Recommendation, feedback: RecommendationReaction) => void;
  feedbackById: Partial<Record<number, RecommendationReaction>>;
  recordedIds: Set<number>;
  skippedIds: Set<number>;
  motion: RecommendationMotion | null;
  aiExplanation?: RecommendationAiExplanation;
  aiExplanationLoading: boolean;
  onExplain: (recommendation: Recommendation) => void;
}) {
  const selected = selectedId === null ? null : items.find((item) => item.id === selectedId) ?? null;
  const fitChips = selected ? recommendationFitChips(selected.source, dashboard) : [];
  const visibleChoiceItems = getVisibleRecommendationChoiceItems(items, selectedId, 5);
  const comparableItems = selected ? visibleChoiceItems.filter((item) => item.id !== selected.id) : visibleChoiceItems;
  const selectedReaction = selected ? feedbackById[selected.id] : undefined;
  const selectedRecorded = selected ? recordedIds.has(selected.id) : false;
  const selectedMotionType = selected && motion?.candidateId === selected.id ? motion.type : null;

  function skipSelectedRecommendation() {
    if (!selected) return;
    const nextCandidate = comparableItems.find((item) => !skippedIds.has(item.id));
    onFeedback(selected.source, "skipped");
    if (nextCandidate) {
      window.setTimeout(() => onSelect(nextCandidate.source), 280);
    }
  }

  return (
    <section ref={panelRef} className={`recommendation-choice-panel ${loading ? "is-loading" : ""}`} aria-label="오늘 추천 후보" data-aos="fade-up" data-aos-delay="50">
      <header className="recommendation-choice-head">
        <div>
          <h2>{loading ? "예산에 맞춰 후보를 고르는 중" : "추천 식단"}</h2>
        </div>
      </header>

      {loading ? (
        <div className="recommendation-loading-banner" role="status" aria-live="polite">
          <span className="button-spinner" aria-hidden="true" />
          <strong>추천 모델 실행 중</strong>
          <em>후보 생성과 랭킹을 완료하면 카드가 자동으로 바뀝니다.</em>
        </div>
      ) : null}

      {selected ? (
        <article className={`recommendation-decision-card ${selectedMotionType ? `motion-${selectedMotionType}` : ""}`}>
          {selectedMotionType && selectedMotionType !== "selected" ? (
            <div className={`recommendation-burst ${selectedMotionType}`} key={motion?.nonce} aria-live="polite">
              {selectedMotionType === "accepted" ? <FaIcon name="thumbs-up" size={18} /> : null}
              {selectedMotionType === "skipped" ? <FaIcon name="thumbs-down" size={18} /> : null}
              {selectedMotionType === "logged" ? <FaIcon name="cutlery" size={18} /> : null}
              <strong>{recommendationBurstLabel(selectedMotionType)}</strong>
            </div>
          ) : null}
          <div className="recommendation-decision-main">
            <span className="recommendation-decision-kicker">{selected.subtitle}</span>
            <h3>{selected.title}</h3>
            <em>{selected.meta}</em>
          </div>

          <div className="recommendation-decision-actions">
            <button className={selectedReaction === "skipped" ? "active negative" : ""} type="button" aria-pressed={selectedReaction === "skipped"} onClick={skipSelectedRecommendation}>
              별로
            </button>
            <button className={selectedReaction === "accepted" ? "active positive" : ""} type="button" aria-pressed={selectedReaction === "accepted"} onClick={() => onFeedback(selected.source, "accepted")}>
              좋아요
            </button>
            <button className={selectedRecorded ? "active logged" : ""} type="button" onClick={() => onRecord(selected.source)}>
              {selectedRecorded ? "기록됨" : "기록"}
            </button>
          </div>

          <div className="recommendation-decision-fit" aria-label="추천 근거">
            {fitChips.slice(0, 4).map((chip) => (
              <small key={chip}>{chip}</small>
            ))}
          </div>

          <div className="recommendation-decision-nutrition" aria-label="영양 정보">
            {selected.nutrition.slice(0, 3).map((nutrition) => (
              <span key={nutrition.label}>
                {nutrition.label} <b>{nutrition.value}</b>
              </span>
            ))}
          </div>

          <div className="recommendation-ai-panel" aria-live="polite">
            <button type="button" disabled={aiExplanationLoading} onClick={() => onExplain(selected.source)}>
              {aiExplanationLoading ? "AI가 설명 중..." : aiExplanation ? "AI 설명 다시 보기" : "AI 추천 설명"}
            </button>
            {aiExplanation ? (
              <article>
                <strong>{aiExplanation.headline}</strong>
                <p>{aiExplanation.summary}</p>
                <ul>
                  {aiExplanation.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
                {aiExplanation.cautions.length ? <em>{aiExplanation.cautions.join(" · ")}</em> : null}
              </article>
            ) : null}
          </div>
        </article>
      ) : (
        <article className="recommendation-decision-empty">
          <strong>{loading ? "추천 후보를 준비 중입니다" : hasRequested ? "조건에 맞는 후보가 아직 없습니다" : "추천 후보를 선택해 주세요"}</strong>
          <p>
            {loading
              ? "ML 작업이 끝나면 음식 카드가 이 영역에 자동으로 표시됩니다."
              : hasRequested
                ? "예산을 조금 조정하거나 음식 DB 후보 풀이 갱신된 뒤 다시 추천받아 주세요."
                : "예산을 입력하고 추천을 받으면 바로 비교할 수 있어요."}
          </p>
        </article>
      )}

      {comparableItems.length ? (
        <div className="recommendation-alternative-rail" aria-label="다른 후보">
          {comparableItems.map((item, index) => {
            const reaction = feedbackById[item.id];
            const recorded = recordedIds.has(item.id);
            const skippedToday = skippedIds.has(item.id);
            return (
              <button
                className={`recommendation-alt-card ${skippedToday ? "today-skipped" : ""} ${recorded || reaction ? "has-response" : ""}`}
                key={item.id}
                type="button"
                onClick={() => onSelect(item.source)}
              >
                <span>{index + 2}</span>
                <strong>{item.title}</strong>
                <em>{item.meta}</em>
              </button>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

function RecommendationBudgetPanel({
  mealType,
  budgetDraft,
  appliedBudgetKrw,
  remainingBudgetKrw,
  remainingCaloriesKcal,
  loading,
  onMealTypeChange,
  onBudgetChange,
  onSubmit,
}: {
  mealType: MealType;
  budgetDraft: string;
  appliedBudgetKrw: number;
  remainingBudgetKrw: number;
  remainingCaloriesKcal: number;
  loading: boolean;
  onMealTypeChange: (mealType: MealType) => void;
  onBudgetChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <section className="recommendation-budget-panel" aria-label="끼니 예산 추천" data-aos="fade-up" data-aos-delay="20">
      <header>
        <div>
          <span>끼니 예산</span>
          <h2>얼마 안에서 먹을까요?</h2>
          <p>예산, 남은 칼로리, 선호도를 함께 보고 지금 먹기 좋은 후보를 정렬합니다.</p>
        </div>
      </header>

      <form className="recommendation-budget-form" onSubmit={onSubmit}>
        <div className="recommendation-meal-type-chips" role="group" aria-label="끼니 선택">
          {mealTypes.map((option) => (
            <button
              className={mealType === option ? "active" : ""}
              key={option}
              type="button"
              aria-pressed={mealType === option}
              onClick={() => onMealTypeChange(option)}
            >
              {mealTypeLabel(option)}
            </button>
          ))}
        </div>

        <label className="recommendation-budget-input">
          <span>이번 끼니 예산</span>
          <div>
            <input
              inputMode="numeric"
              min="0"
              name="targetMealBudgetKrw"
              placeholder="예: 7000"
              type="text"
              value={budgetDraft}
              onChange={(event) => onBudgetChange(normalizeMoneyInput(event.target.value))}
            />
            <em>원</em>
          </div>
        </label>

        <button className="recommendation-budget-submit" type="submit" aria-busy={loading} disabled={loading}>
          {loading ? (
            <>
              <span className="button-spinner" aria-hidden="true" />
              ML 추천 계산 중
            </>
          ) : (
            "예산 맞춰 추천"
          )}
        </button>
        {loading ? <p className="recommendation-budget-loading" aria-live="polite">MILP 후보를 만들고 LightFM/XGBoost로 재정렬하는 중입니다.</p> : null}
      </form>

      <div className="recommendation-budget-meta" aria-label="추천 기준 요약">
        <span>
          적용 예산 <b>{formatWon(appliedBudgetKrw)}</b>
        </span>
        <span>
          남은 식비 <b>{formatWon(remainingBudgetKrw)}</b>
        </span>
        <span>
          남은 kcal <b>{formatKcal(remainingCaloriesKcal)}</b>
        </span>
      </div>
    </section>
  );
}

function RecommendationDrawLayer({
  open,
  items,
  selectedId,
  onClose,
  onSelect,
  onRecord,
  onFeedback,
  feedbackById,
  recordedIds,
  skippedIds,
  motion,
}: {
  open: boolean;
  items: RecommendationViewModel[];
  selectedId: number | null;
  onClose: () => void;
  onSelect: (recommendation: Recommendation) => void;
  onRecord: (recommendation: Recommendation) => void;
  onFeedback: (recommendation: Recommendation, feedback: RecommendationReaction) => void;
  feedbackById: Partial<Record<number, RecommendationReaction>>;
  recordedIds: Set<number>;
  skippedIds: Set<number>;
  motion: RecommendationMotion | null;
}) {
  if (!open) return null;

  return (
    <div className="recommendation-draw-layer open">
      <button className="recommendation-draw-backdrop" type="button" aria-label="추천 카드 닫기" onClick={onClose} />
      <section className="recommendation-draw-stage" role="dialog" aria-modal="true" aria-label="오늘 추천 후보 카드">
        <header>
          <div>
            <span>오늘 후보 3개</span>
            <h2>카드 하나 골라 기록</h2>
          </div>
          <button type="button" aria-label="닫기" onClick={onClose}>
            <FaIcon name="times" size={20} />
          </button>
        </header>
        <RecommendationDrawCards
          items={items}
          selectedId={selectedId}
          onSelect={onSelect}
          onRecord={(recommendation) => {
            onRecord(recommendation);
            onClose();
          }}
          onFeedback={onFeedback}
          feedbackById={feedbackById}
          recordedIds={recordedIds}
          skippedIds={skippedIds}
          motion={motion}
        />
      </section>
    </div>
  );
}

function RecommendationRecordSheet({
  pending,
  onClose,
  onConfirm,
}: {
  pending: PendingRecommendationRecord | null;
  onClose: () => void;
  onConfirm: (mealType: MealType) => void;
}) {
  const [mealType, setMealType] = useState<MealType>("dinner");

  useEffect(() => {
    if (pending) setMealType(pending.recommendation.mealType);
  }, [pending]);

  if (!pending) return null;
  const recommendation = pending.recommendation;

  return (
    <div className="recommendation-record-layer open">
      <button className="recommendation-record-backdrop" type="button" aria-label="추천 기록 닫기" onClick={onClose} />
      <section className="recommendation-record-sheet" role="dialog" aria-modal="true" aria-label="추천 식단 기록하기">
        <span className="sheet-handle" aria-hidden="true" />
        <header>
          <div>
            <span>추천 기록</span>
            <h2>언제 먹었나요?</h2>
          </div>
          <button type="button" aria-label="닫기" onClick={onClose}>
            <FaIcon name="times" size={20} />
          </button>
        </header>

        <article className="recommendation-record-preview">
          <strong>{recommendation.name}</strong>
          <span>
            {formatWon(recommendation.totalPriceKrw)} · {formatKcal(recommendation.totalCaloriesKcal)} · 단백질 {recommendation.totalProteinG}g
          </span>
        </article>

        <div className="recommendation-record-picker" role="radiogroup" aria-label="먹은 끼니 선택">
          {mealTypes.map((type) => (
            <button
              className={mealType === type ? "active" : ""}
              key={type}
              type="button"
              role="radio"
              aria-checked={mealType === type}
              onClick={() => setMealType(type)}
            >
              <strong>{mealTypeLabel(type)}</strong>
              <span>{mealTypeRecordTimes[type]}</span>
            </button>
          ))}
        </div>

        <button className="recommendation-record-confirm" type="button" onClick={() => onConfirm(mealType)}>
          {mealTypeLabel(mealType)}으로 기록
        </button>
      </section>
    </div>
  );
}

function FoodSearchDrawer({
  open,
  foods,
  loading,
  hasMore,
  selectedMealType,
  query,
  exactSearch,
  favoriteFoodIds,
  onClose,
  onQueryChange,
  onExactSearchChange,
  onFavorite,
  onRecord,
}: {
  open: boolean;
  foods: Food[];
  loading: boolean;
  hasMore: boolean;
  selectedMealType: MealType;
  query: string;
  exactSearch: boolean;
  favoriteFoodIds: Set<number>;
  onClose: () => void;
  onQueryChange: (query: string) => void;
  onExactSearchChange: (exact: boolean) => void;
  onFavorite: (food: Food) => void;
  onRecord: (food: Food, mealType: MealType) => void;
}) {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [foodPage, setFoodPage] = useState(1);
  const foodPageSize = 6;
  const totalFoodPages = Math.max(1, Math.ceil(foods.length / foodPageSize));
  const safeFoodPage = Math.min(foodPage, totalFoodPages);
  const visibleFoods = foods.slice((safeFoodPage - 1) * foodPageSize, safeFoodPage * foodPageSize);
  const pageWindowStart = Math.min(Math.max(1, safeFoodPage - 1), Math.max(1, totalFoodPages - 3));
  const foodPageButtons = Array.from({ length: Math.min(4, totalFoodPages) }, (_, index) => pageWindowStart + index);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => searchInputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    setFoodPage(1);
  }, [exactSearch, open, query]);

  useEffect(() => {
    if (foodPage > totalFoodPages) setFoodPage(totalFoodPages);
  }, [foodPage, totalFoodPages]);

  useEffect(() => {
    if (!open) return undefined;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className="food-search-layer open">
      <button className="food-search-backdrop" type="button" aria-label="직접 기록 닫기" onClick={onClose} />
      <section className="food-search-drawer" id="manual-food-panel" role="dialog" aria-modal="true" aria-label="직접 찾아서 기록">
        <header>
          <div>
            <span>직접 기록</span>
            <h2>찾아서 바로 기록</h2>
          </div>
          <button type="button" aria-label="닫기" onClick={onClose}>
            <FaIcon name="times" size={22} />
          </button>
        </header>

        <div className="drawer-search-box">
          <FaIcon name="search" size={19} />
          <input
            ref={searchInputRef}
            type="search"
            placeholder="음식명, 브랜드명, 태그 검색"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
          />
          <button className={exactSearch ? "active" : ""} type="button" aria-pressed={exactSearch} onClick={() => onExactSearchChange(!exactSearch)}>
            정확히
          </button>
        </div>

        <div className="drawer-result-list">
          <div className="drawer-results-head">
            <span>
              검색 결과 {foods.length.toLocaleString()}개{hasMore ? "+" : ""}
            </span>
            <em>
              {safeFoodPage} / {totalFoodPages}
            </em>
          </div>
          {loading ? (
            <p className="drawer-empty">검색 중이에요.</p>
          ) : visibleFoods.length ? (
            visibleFoods.map((food) => {
              const favorite = favoriteFoodIds.has(food.id);
              return (
                <article className="drawer-food-row" key={food.id}>
                  <div>
                    <strong>{food.name}</strong>
                    <em>{foodRecordMeta(food)}</em>
                  </div>
                  <button
                    className={`drawer-favorite ${favorite ? "active" : ""}`}
                    type="button"
                    aria-label={favorite ? "즐겨찾기 해제" : "즐겨찾기 추가"}
                    onClick={() => onFavorite(food)}
                  >
                    <FaIcon name={favorite ? "heart" : "heart-o"} size={17} />
                  </button>
                  <button className="drawer-record" type="button" onClick={() => onRecord(food, selectedMealType)}>
                    기록
                  </button>
                </article>
              );
            })
          ) : (
            <p className="drawer-empty">검색 결과가 없어요.</p>
          )}
          {foods.length > foodPageSize ? (
            <nav className="meal-record-pagination" aria-label="식품 검색 페이지">
              <button type="button" disabled={safeFoodPage === 1} onClick={() => setFoodPage((current) => Math.max(1, current - 1))}>
                이전
              </button>
              {foodPageButtons.map((page) => (
                <button className={safeFoodPage === page ? "active" : ""} key={page} type="button" aria-current={safeFoodPage === page ? "page" : undefined} onClick={() => setFoodPage(page)}>
                  {page}
                </button>
              ))}
              <button type="button" disabled={safeFoodPage === totalFoodPages} onClick={() => setFoodPage((current) => Math.min(totalFoodPages, current + 1))}>
                다음
              </button>
            </nav>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function MealRecordSheet({
  open,
  foods,
  loading,
  hasMore,
  recordTab,
  selectedMealType,
  query,
  exactSearch,
  remainingCaloriesKcal,
  remainingBudgetKrw,
  favoriteFoodIds,
  onClose,
  onRecordTabChange,
  onMealTypeChange,
  onQueryChange,
  onExactSearchChange,
  onFavorite,
  onRecord,
  onManualRecord,
  onParseNaturalMeal,
}: {
  open: boolean;
  foods: Food[];
  loading: boolean;
  hasMore: boolean;
  recordTab: RecordTab;
  selectedMealType: MealType;
  query: string;
  exactSearch: boolean;
  remainingCaloriesKcal: number;
  remainingBudgetKrw: number;
  favoriteFoodIds: Set<number>;
  onClose: () => void;
  onRecordTabChange: (tab: RecordTab) => void;
  onMealTypeChange: (mealType: MealType) => void;
  onQueryChange: (query: string) => void;
  onExactSearchChange: (exact: boolean) => void;
  onFavorite: (food: Food) => void;
  onRecord: (food: Food, mealType: MealType) => void;
  onManualRecord: (event: FormEvent<HTMLFormElement>) => void;
  onParseNaturalMeal: (input: { text: string; mealType: MealType }) => Promise<NaturalLanguageMealDraft>;
}) {
  const [foodPage, setFoodPage] = useState(1);
  const [naturalMealText, setNaturalMealText] = useState("");
  const [naturalMealDraft, setNaturalMealDraft] = useState<NaturalLanguageMealDraft | null>(null);
  const [naturalMealDraftNonce, setNaturalMealDraftNonce] = useState(0);
  const [naturalMealLoading, setNaturalMealLoading] = useState(false);
  const [naturalMealError, setNaturalMealError] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const filteredFoods = foods;
  const foodPageSize = 8;
  const totalFoodPages = Math.max(1, Math.ceil(filteredFoods.length / foodPageSize));
  const safeFoodPage = Math.min(foodPage, totalFoodPages);
  const visibleFoods = filteredFoods.slice((safeFoodPage - 1) * foodPageSize, safeFoodPage * foodPageSize);
  const pageWindowStart = Math.min(Math.max(1, safeFoodPage - 1), Math.max(1, totalFoodPages - 3));
  const foodPageButtons = Array.from({ length: Math.min(4, totalFoodPages) }, (_, index) => pageWindowStart + index);

  useEffect(() => {
    setFoodPage(1);
  }, [exactSearch, normalizedQuery, open, recordTab]);

  useEffect(() => {
    if (foodPage > totalFoodPages) setFoodPage(totalFoodPages);
  }, [foodPage, totalFoodPages]);

  useEffect(() => {
    if (!open) {
      setNaturalMealText("");
      setNaturalMealDraft(null);
      setNaturalMealError("");
    }
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose, open]);

  if (!open) return null;

  async function parseNaturalMealDraft() {
    const text = naturalMealText.trim();
    if (!text) {
      setNaturalMealError("먹은 음식을 문장으로 입력해 주세요.");
      return;
    }
    setNaturalMealLoading(true);
    setNaturalMealError("");
    try {
      const draft = await onParseNaturalMeal({ text, mealType: selectedMealType });
      setNaturalMealDraft(draft);
      setNaturalMealDraftNonce((current) => current + 1);
      if (draft.meal.mealType !== selectedMealType) onMealTypeChange(draft.meal.mealType);
    } catch (error) {
      setNaturalMealError(error instanceof Error ? error.message : "AI가 식단 문장을 해석하지 못했어요.");
    } finally {
      setNaturalMealLoading(false);
    }
  }

  const resultLabel =
    recordTab === "recent"
      ? "최근 기록"
      : recordTab === "preferred"
        ? "즐겨찾기 식품"
        : recordTab === "search"
          ? normalizedQuery
            ? "검색 결과"
            : "추천 식품"
          : "직접 입력";
  const emptyMessage =
    recordTab === "recent"
      ? "최근 기록이 아직 없어요."
      : recordTab === "preferred"
        ? "즐겨찾기한 음식이 아직 없어요."
        : "조건에 맞는 음식이 없어요.";

  return (
    <div className="meal-record-layer open">
      <button className="meal-record-backdrop" type="button" aria-label="먹은 음식 기록 닫기" onClick={onClose} />
      <section className="meal-record-sheet" id="meal-record-sheet" role="dialog" aria-modal="true" aria-label="먹은 음식 기록하기">
        <div className="sheet-handle" aria-hidden="true" />
        <header>
          <div>
            <span>{mealTypeLabel(selectedMealType)}에 추가</span>
            <h2>먹은 음식 기록하기</h2>
          </div>
          <button type="button" aria-label="닫기" onClick={onClose}>
            <FaIcon name="times" size={22} />
          </button>
        </header>

        <div className="meal-record-context" aria-label="기록 기준">
          <span>
            남은 칼로리 <b>{formatKcal(remainingCaloriesKcal)}</b>
          </span>
          <span>
            이번 주 잔액 <b>{formatWon(remainingBudgetKrw)}</b>
          </span>
        </div>

        <div className="meal-record-sticky-controls">
          <div className="meal-record-category-picker" role="radiogroup" aria-label="끼니 선택">
            {mealTypes.map((type) => (
              <button
                className={selectedMealType === type ? "active" : ""}
                key={type}
                type="button"
                role="radio"
                aria-checked={selectedMealType === type}
                onClick={() => onMealTypeChange(type)}
              >
                {mealTypeLabel(type)}
              </button>
            ))}
          </div>
          <div className="meal-record-search">
            <FaIcon name="search" size={19} />
            <input type="search" placeholder="음식명, 브랜드명, 태그 검색" value={query} onChange={(event) => onQueryChange(event.target.value)} />
            <button className={exactSearch ? "active" : ""} type="button" aria-pressed={exactSearch} onClick={() => onExactSearchChange(!exactSearch)}>
              정확히
            </button>
          </div>

          <div className="meal-record-tabs" role="tablist" aria-label="기록 분류">
            <button className={recordTab === "recent" ? "active" : ""} type="button" aria-selected={recordTab === "recent"} onClick={() => onRecordTabChange("recent")}>
              최근
            </button>
            <button
              className={recordTab === "preferred" ? "active" : ""}
              type="button"
              aria-selected={recordTab === "preferred"}
              onClick={() => onRecordTabChange("preferred")}
            >
              즐겨찾기
            </button>
            <button className={recordTab === "search" ? "active" : ""} type="button" aria-selected={recordTab === "search"} onClick={() => onRecordTabChange("search")}>
              검색
            </button>
            <button className={recordTab === "manual" ? "active" : ""} type="button" aria-selected={recordTab === "manual"} onClick={() => onRecordTabChange("manual")}>
              직접 입력
            </button>
          </div>

        </div>

        {recordTab === "manual" ? (
          <form className="manual-meal-form" key={`manual-${naturalMealDraftNonce}`} onSubmit={onManualRecord}>
            <section className="natural-meal-ai-box" aria-label="AI 자연어 식단 기록">
              <label>
                <span>AI로 빠르게 채우기</span>
                <textarea
                  value={naturalMealText}
                  onChange={(event) => setNaturalMealText(event.target.value)}
                  placeholder="예: 점심에 계란 2개랑 고구마 하나 먹었어"
                  rows={3}
                />
              </label>
              <button type="button" disabled={naturalMealLoading} onClick={parseNaturalMealDraft}>
                {naturalMealLoading ? "입력 중..." : "AI로 입력"}
              </button>
              {naturalMealError ? <p className="natural-meal-ai-error">{naturalMealError}</p> : null}
              {naturalMealDraft ? (
                <p className="natural-meal-ai-note">
                  {naturalMealDraft.meal.nutritionSource === "db"
                    ? "DB 식품 기준으로 초안을 채웠어요."
                    : naturalMealDraft.meal.nutritionSource === "mixed"
                      ? "DB 기준과 추정값을 함께 사용했어요."
                      : naturalMealDraft.meal.nutritionSource === "gemini_estimate"
                        ? "DB 매칭이 없어 Gemini 추정값을 사용했어요."
                        : "기본 초안을 채웠어요."}{" "}
                  {naturalMealDraft.meal.nutritionSource === "gemini_estimate" ? "추정 신뢰도" : "매칭 신뢰도"}{" "}
                  {Math.round(naturalMealDraft.meal.confidence * 100)}%
                  {naturalMealDraft.meal.notes.length ? ` · ${naturalMealDraft.meal.notes[0]}` : ""}
                </p>
              ) : null}
            </section>
            <input type="hidden" name="mealType" value={naturalMealDraft?.meal.mealType ?? selectedMealType} />
            <label>
              <span>음식명</span>
              <input name="foodName" type="text" placeholder="예: 김치볶음밥" defaultValue={naturalMealDraft?.meal.foodName ?? ""} required />
            </label>
            <div className="manual-meal-grid">
              <label>
                <span>칼로리</span>
                <input name="caloriesKcal" type="number" min="0" step="1" placeholder="kcal" defaultValue={naturalMealDraft?.meal.caloriesKcal ?? ""} required />
              </label>
              <label>
                <span>지출</span>
                <input name="spentMoneyKrw" type="number" min="0" step="100" placeholder="원" defaultValue={naturalMealDraft?.meal.spentMoneyKrw ?? ""} />
              </label>
              <label>
                <span>단백질</span>
                <input name="proteinG" type="number" min="0" step="0.1" placeholder="g" defaultValue={naturalMealDraft?.meal.proteinG ?? ""} />
              </label>
              <label>
                <span>탄수</span>
                <input name="carbsG" type="number" min="0" step="0.1" placeholder="g" defaultValue={naturalMealDraft?.meal.carbsG ?? ""} />
              </label>
              <label>
                <span>지방</span>
                <input name="fatG" type="number" min="0" step="0.1" placeholder="g" defaultValue={naturalMealDraft?.meal.fatG ?? ""} />
              </label>
              <label>
                <span>양</span>
                <input name="quantityLabel" type="text" placeholder="1인분" defaultValue={naturalMealDraft?.meal.quantityLabel ?? ""} />
              </label>
            </div>
            <button className="manual-meal-submit" type="submit">
              직접 입력으로 기록
            </button>
          </form>
        ) : (
          <div className="meal-record-results">
            <div className="meal-record-results-head">
              <span>
                {resultLabel} {filteredFoods.length.toLocaleString()}개{hasMore ? "+" : ""}
              </span>
              <em>
                {safeFoodPage} / {totalFoodPages}
              </em>
            </div>
            {loading ? (
              <p className="drawer-empty">검색 중이에요.</p>
            ) : visibleFoods.length ? (
            visibleFoods.map((food) => {
              const favorite = favoriteFoodIds.has(food.id);
              return (
                <article className="meal-record-row" key={food.id}>
                  <div>
                    <strong>{food.name}</strong>
                    <em>{foodRecordMeta(food)}</em>
                  </div>
                  <button
                    className={`drawer-favorite ${favorite ? "active" : ""}`}
                    type="button"
                    aria-label={favorite ? "즐겨찾기 해제" : "즐겨찾기 추가"}
                    onClick={() => onFavorite(food)}
                  >
                    <FaIcon name={favorite ? "heart" : "heart-o"} size={17} />
                  </button>
                  <button className="meal-record-submit" type="button" onClick={() => onRecord(food, selectedMealType)}>
                    기록
                  </button>
                </article>
              );
            })
          ) : (
            <p className="drawer-empty">{emptyMessage}</p>
          )}
            {filteredFoods.length > foodPageSize ? (
              <nav className="meal-record-pagination" aria-label="식품 데이터 페이지">
                <button type="button" disabled={safeFoodPage === 1} onClick={() => setFoodPage((current) => Math.max(1, current - 1))}>
                  이전
                </button>
                {foodPageButtons.map((page) => (
                  <button className={safeFoodPage === page ? "active" : ""} key={page} type="button" aria-current={safeFoodPage === page ? "page" : undefined} onClick={() => setFoodPage(page)}>
                    {page}
                  </button>
                ))}
                <button type="button" disabled={safeFoodPage === totalFoodPages} onClick={() => setFoodPage((current) => Math.min(totalFoodPages, current + 1))}>
                  다음
                </button>
              </nav>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}

const shockEventOptions: Array<{ id: ShockEventType; label: string; helper: string }> = [
  { id: "eating_out", label: "외식", helper: "예상 밖 식사" },
  { id: "delivery", label: "배달", helper: "집/회사 주문" },
  { id: "company_dinner", label: "회식", helper: "단체 식사" },
  { id: "other", label: "기타", helper: "직접 메모" },
];

type RecoverySuggestion = RecoveryPlanRevision["suggestions"][number];

const recoveryActionLabels: Record<RecoverySuggestion["action"], string> = {
  replace: "교체",
  remove: "제외",
  add: "추가",
};

function recoveryStatusLabel(status: RecoveryPlanRevision["revisionStatus"]) {
  if (status === "feasible" || status === "accepted") return "진행 가능";
  if (status === "rejected") return "보류";
  return "주의";
}

function recoveryConstraintLabel(constraint: RecoveryPlanRevision["blockedConstraint"]) {
  if (constraint === "budget") return "예산";
  if (constraint === "protein") return "단백질";
  if (constraint === "channel") return "식사 채널";
  if (constraint === "calories") return "칼로리";
  return null;
}

function recoverySuggestionTitle(suggestion: RecoverySuggestion) {
  if (suggestion.candidate) return suggestion.candidate.name;
  return suggestion.action === "remove" ? "이 식사는 건너뛰기" : "식단 조정";
}

function recoverySuggestionMeta(suggestion: RecoverySuggestion) {
  const metrics = [
    suggestion.revisedPriceKrw !== null ? formatWon(suggestion.revisedPriceKrw) : null,
    suggestion.revisedCaloriesKcal !== null ? formatKcal(suggestion.revisedCaloriesKcal) : null,
    suggestion.revisedProteinG !== null ? `단백질 ${suggestion.revisedProteinG}g` : null,
  ].filter(Boolean);
  return metrics.length ? metrics.join(" · ") : "기준 안에서 다시 조정";
}

function withWeeklyPlanTotals(plan: WeeklyPlanSummary): WeeklyPlanSummary {
  const totals = plan.meals.reduce(
    (acc, meal) => ({
      plannedPriceKrw: acc.plannedPriceKrw + meal.plannedPriceKrw,
      plannedCaloriesKcal: acc.plannedCaloriesKcal + meal.plannedCaloriesKcal,
      plannedProteinG: acc.plannedProteinG + meal.plannedProteinG,
    }),
    { plannedPriceKrw: 0, plannedCaloriesKcal: 0, plannedProteinG: 0 },
  );
  return { ...plan, totals };
}

function sortWeeklyMeals(meals: WeeklyPlanMeal[]) {
  return [...meals].sort((a, b) => mealTypeRank[a.mealType] - mealTypeRank[b.mealType]);
}

function weeklyCandidateDisplayKey(candidate: Recommendation | null) {
  if (!candidate) return "";
  return [candidate.name, candidate.totalPriceKrw, candidate.totalCaloriesKcal, candidate.totalProteinG].join("|");
}

function WeeklyPlanPanel({
  plan,
  onGenerate,
  onRecordMeal,
  onRefreshMeal,
  refreshingMealIds,
  notice,
}: {
  plan: WeeklyPlanSummary | null;
  onGenerate: () => void;
  onRecordMeal: (meal: WeeklyPlanMeal) => void;
  onRefreshMeal: (meal: WeeklyPlanMeal) => void;
  refreshingMealIds: Set<number>;
  notice: string;
}) {
  const mealsByDay = weekLabels.map((label, dayIndex) => ({
    label,
    dayIndex,
    meals: sortWeeklyMeals(plan?.meals.filter((meal) => meal.dayIndex === dayIndex) ?? []),
  }));

  return (
    <section className="weekly-plan-panel" aria-label="주간 식단 계획">
      <header className="service-section-head">
        <div>
          <span>주간 계획</span>
          <h2>후보 관리</h2>
        </div>
        <button type="button" onClick={onGenerate}>
          다시 생성
        </button>
      </header>
      {notice ? <p className="inline-message weekly-plan-message">{notice}</p> : null}
      {plan ? (
        <>
          <div className="weekly-plan-days">
            {mealsByDay.map((day) => (
              <article key={day.dayIndex}>
                <header>
                  <strong>{day.label}</strong>
                  <span>{plan.startDate ? shortDate(addDays(plan.startDate, day.dayIndex)) : ""}</span>
                </header>
                {day.meals.slice(0, 3).map((meal) => (
                  <div className="weekly-plan-meal-row" key={meal.id}>
                    <span>{mealTypeLabel(meal.mealType)}</span>
                    <button
                      className="weekly-plan-candidate-button"
                      type="button"
                      disabled={!meal.candidate}
                      aria-label={meal.candidate ? `${meal.candidate.name} 기록하기` : `${mealTypeLabel(meal.mealType)} 후보 없음`}
                      onClick={() => onRecordMeal(meal)}
                    >
                      <strong>{meal.candidate?.name ?? "후보 없음"}</strong>
                      <em>{formatWon(meal.plannedPriceKrw)}</em>
                    </button>
                    <button
                      className={`weekly-plan-refresh-button ${refreshingMealIds.has(meal.id) ? "refreshing" : ""}`}
                      type="button"
                      aria-label={`${mealTypeLabel(meal.mealType)} 후보 새로고침`}
                      disabled={refreshingMealIds.has(meal.id)}
                      onClick={() => onRefreshMeal(meal)}
                    >
                      <RotateCcwIcon size={17} />
                    </button>
                  </div>
                ))}
              </article>
            ))}
          </div>
        </>
      ) : (
        <article className="weekly-plan-empty">
          <strong>주간 계획을 만들 수 있어요.</strong>
          <span>알레르기와 선호도를 반영해 후보를 배치합니다.</span>
          <button type="button" onClick={onGenerate}>
            계획 생성
          </button>
        </article>
      )}
    </section>
  );
}

function ShockRecoveryPanel({
  revisions,
  onOpenCreate,
}: {
  revisions: RecoveryPlanRevision[];
  onOpenCreate: () => void;
}) {
  const latestRevision = revisions[0];
  const latestSuggestionCount = latestRevision?.suggestions.length ?? 0;

  return (
    <section className="shock-recovery-panel" aria-label="회복 플랜" data-aos="fade-up" data-aos-delay="80">
      <header className="service-section-head">
        <div>
          <span>회복</span>
          <h2>회복 플랜</h2>
        </div>
        <button type="button" onClick={onOpenCreate}>
          만들기
        </button>
      </header>

      {latestRevision ? (
        <article className={`recovery-plan-focus ${latestRevision.revisionStatus === "feasible" ? "feasible" : "warning"}`}>
          <header>
            <div>
              <span>
                {weekLabels[latestRevision.eventDayIndex]} · {latestRevision.eventLabel}
              </span>
              <strong>{formatWon(latestRevision.expectedSpendKrw)} 회복 플랜</strong>
              {latestRevision.note ? <small>{latestRevision.note}</small> : null}
            </div>
            <em>{recoveryStatusLabel(latestRevision.revisionStatus)}</em>
          </header>
          <div className="recovery-plan-brief" aria-label="회복 플랜 요약">
            <span>{latestSuggestionCount}개 식사 조정</span>
            <span>{latestRevision.blockedConstraint ? `제약: ${recoveryConstraintLabel(latestRevision.blockedConstraint)}` : "예산 기준 반영"}</span>
          </div>
          <div className="recovery-plan-route" aria-label="회복 플랜 조정 순서">
            {latestRevision.suggestions.slice(0, 3).map((suggestion, index) => (
              <article key={suggestion.id} style={{ animationDelay: `${index * 70}ms` }}>
                <b aria-label={`${index + 1}번째 조정`}>{index + 1}</b>
                <div>
                  <span>
                    {weekLabels[suggestion.dayIndex]} · {mealTypeLabel(suggestion.mealType)} {recoveryActionLabels[suggestion.action]}
                  </span>
                  <strong>{recoverySuggestionTitle(suggestion)}</strong>
                  <em>{recoverySuggestionMeta(suggestion)}</em>
                </div>
              </article>
            ))}
          </div>
        </article>
      ) : (
        <article className="recovery-plan-empty">
          <strong>외식이나 배달 예정이 있나요?</strong>
          <span>예상 지출과 요일만 넣으면 현재 예산 안에서 조정안을 보여줍니다.</span>
          <button type="button" onClick={onOpenCreate}>
            회복 플랜 만들기
          </button>
        </article>
      )}

      {revisions.length > 1 ? (
        <div className="recovery-revision-list">
          {revisions.slice(1).map((revision) => (
            <article key={revision.id}>
              <header>
                <div>
                  <span>
                    {weekLabels[revision.eventDayIndex]} · {revision.eventLabel}
                  </span>
                  <strong>{formatWon(revision.expectedSpendKrw)} 회복 플랜</strong>
                </div>
                <em>{recoveryStatusLabel(revision.revisionStatus)}</em>
              </header>
              {revision.suggestions.slice(0, 3).map((suggestion) => (
                <p key={suggestion.id}>
                  <b>
                    {weekLabels[suggestion.dayIndex]} · {mealTypeLabel(suggestion.mealType)} {recoveryActionLabels[suggestion.action]}
                  </b>
                  {recoverySuggestionTitle(suggestion)}
                </p>
              ))}
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function RecoveryEventMiniList({
  revisions,
  onOpenCreate,
  onDelete,
}: {
  revisions: RecoveryPlanRevision[];
  onOpenCreate: () => void;
  onDelete: (revision: RecoveryPlanRevision) => void;
}) {
  return (
    <section className="recovery-event-mini-list" aria-label="예상 이벤트 기록">
      <header>
        <div>
          <span>예상 이벤트</span>
          <strong>최근 입력한 회복 플랜</strong>
        </div>
        <button type="button" onClick={onOpenCreate}>
          추가
        </button>
      </header>
      {revisions.length ? (
        <div>
          {revisions.slice(0, 4).map((revision) => (
            <article key={revision.id}>
              <span>
                {shortDate(revision.eventDate)} · {weekLabels[revision.eventDayIndex]} · {revision.eventLabel}
              </span>
              <strong>{formatWon(revision.expectedSpendKrw)}</strong>
              <em>{revision.note || recoveryStatusLabel(revision.revisionStatus)}</em>
              <button type="button" onClick={() => onDelete(revision)}>
                삭제
              </button>
            </article>
          ))}
        </div>
      ) : (
        <p>외식, 배달, 회식 예정이 있으면 날짜와 예상 지출을 남겨 회복 플랜을 만들 수 있어요.</p>
      )}
    </section>
  );
}

function RecoveryPlanSheet({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (input: { eventType: ShockEventType; expectedSpendKrw: number; eventDayIndex: number; note?: string; referenceDate?: string }) => Promise<void>;
}) {
  const [eventType, setEventType] = useState<ShockEventType>("eating_out");
  const [expectedSpendKrw, setExpectedSpendKrw] = useState("18000");
  const [eventDate, setEventDate] = useState(() => todayISO());
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const selectedEvent = shockEventOptions.find((option) => option.id === eventType) ?? shockEventOptions[0];
  const spendValue = Number(expectedSpendKrw || 0);
  const spendPresets = [12000, 18000, 25000];
  const eventDayIndex = weekDayIndexFromISO(eventDate);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      await onCreate({
        eventType,
        expectedSpendKrw: Math.max(spendValue, 0),
        eventDayIndex,
        note,
        referenceDate: eventDate,
      });
      setNote("");
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <div className="recovery-plan-layer open">
      <button className="recovery-plan-backdrop" type="button" aria-label="회복 플랜 닫기" onClick={onClose} />
      <form className="recovery-plan-sheet" role="dialog" aria-modal="true" aria-label="회복 플랜 만들기" onSubmit={submit}>
        <span className="sheet-handle" aria-hidden="true" />
        <header>
          <div>
            <span>회복 플랜</span>
            <h2>예상 이벤트 입력</h2>
          </div>
          <button type="button" aria-label="닫기" onClick={onClose}>
            <FaIcon name="times" size={20} />
          </button>
        </header>
        <div className="shock-type-grid" role="radiogroup" aria-label="이벤트 종류">
          {shockEventOptions.map((option) => (
            <button className={eventType === option.id ? "active" : ""} key={option.id} type="button" onClick={() => setEventType(option.id)}>
              <strong>{option.label}</strong>
              <span>{option.helper}</span>
            </button>
          ))}
        </div>
        <div className="shock-amount-field">
          <label>
            <span>예상 지출</span>
            <input value={expectedSpendKrw} onChange={(event) => setExpectedSpendKrw(event.target.value)} type="number" min="0" step="1000" />
          </label>
          <div className="shock-amount-presets" aria-label="예상 지출 빠른 입력">
            {spendPresets.map((amount) => (
              <button className={spendValue === amount ? "active" : ""} key={amount} type="button" onClick={() => setExpectedSpendKrw(String(amount))}>
                {formatWon(amount)}
              </button>
            ))}
          </div>
        </div>
        <label className="shock-date-field">
          <span>이벤트 날짜</span>
          <input value={eventDate} onChange={(event) => setEventDate(event.target.value)} type="date" />
        </label>
        <div className="shock-day-field">
          <span>요일</span>
          <div className="shock-day-grid" role="radiogroup" aria-label="이벤트 요일">
            {weekLabels.map((label, index) => (
              <button
                className={eventDayIndex === index ? "active" : ""}
                key={label}
                type="button"
                role="radio"
                aria-checked={eventDayIndex === index}
                onClick={() => setEventDate(dateForWeekday(eventDate || todayISO(), index))}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <label className="recovery-note-field">
          <span>메모</span>
          <input value={note} onChange={(event) => setNote(event.target.value)} type="text" placeholder="예: 저녁 약속" />
        </label>
        <div className="recovery-plan-preview">
          <strong>
            {shortDate(eventDate)} {weekLabels[eventDayIndex]}요일 {selectedEvent.label} 기준
          </strong>
          <span>{formatWon(Math.max(spendValue, 0))}을 이번 주 식단 안에서 조정합니다.</span>
        </div>
        <button type="submit" disabled={spendValue <= 0 || submitting}>
          {submitting ? "만드는 중" : "회복 플랜 만들기"}
        </button>
      </form>
    </div>
  );
}

function QuickRecordSheet({
  open,
  onClose,
  onAction,
}: {
  open: boolean;
  onClose: () => void;
  onAction: (action: QuickAddAction) => void;
}) {
  if (!open) return null;

  return (
    <div className="quick-record-layer open">
      <button className="quick-record-backdrop" type="button" aria-label="기록 선택 닫기" onClick={onClose} />
      <section className="quick-record-sheet" id="quick-record-sheet" role="dialog" aria-modal="true" aria-labelledby="quick-record-title">
        <span className="sheet-handle" aria-hidden="true" />
        <header>
          <div>
            <span>기록</span>
            <h2 id="quick-record-title">기록할 항목 선택</h2>
          </div>
          <button className="quick-record-close" type="button" aria-label="닫기" onClick={onClose}>
            <FaIcon name="times" size={20} />
          </button>
        </header>

        <div className="quick-record-list">
          <button type="button" aria-label="식단 기록 열기" onClick={() => onAction("diet")}>
            <span className="quick-record-icon" aria-hidden="true">
              <FaIcon name="cutlery" size={20} />
            </span>
            <strong>식단 기록</strong>
          </button>
          <button type="button" aria-label="체중 기록 열기" onClick={() => onAction("weight")}>
            <span className="quick-record-icon" aria-hidden="true">
              <FaIcon name="balance-scale" size={20} />
            </span>
            <strong>체중 기록</strong>
          </button>
          <button type="button" aria-label="예산 기록 열기" onClick={() => onAction("budget")}>
            <span className="quick-record-icon" aria-hidden="true">
              <FaIcon name="money" size={20} />
            </span>
            <strong>예산 기록</strong>
          </button>
        </div>
      </section>
    </div>
  );
}

function CalendarThemeScreen({
  summary,
  onBack,
}: {
  summary: CalendarSummary | null;
  onBack: () => void;
}) {
  const days = summary?.days ?? [];
  const [selectedDay, setSelectedDay] = useState<(typeof days)[number] | null>(null);

  return (
    <section className="calendar-theme-screen">
      <header className="calendar-header">
        <div className="calendar-topbar">
          <button type="button" aria-label="뒤로" onClick={onBack}>
            ‹
          </button>
          <h1>캘린더</h1>
          <span aria-hidden="true" />
        </div>
      </header>

      <div className="calendar-preview theme-default">
        <article className="calendar-card meal-time-card">
          <h2>식사 / 운동 시간</h2>
          <div className="calendar-grid calendar-time-grid">
            {days.map((day) => (
              <button
                className={`calendar-day ${selectedDay?.date === day.date ? "active" : ""}`}
                key={day.date}
                type="button"
                onClick={() => setSelectedDay(day)}
              >
                <span>{day.dayLabel}</span>
                <strong>{day.dayOfMonth}</strong>
                <div className="time-bars">
                  {day.meals.slice(0, 3).map((meal) => (
                    <i className={mealBarClass[meal.mealType]} key={`meal-${meal.id}`} />
                  ))}
                  {day.exercises.slice(0, 2).map((exercise) => (
                    <i className="exercise" key={`exercise-${exercise.id}`} />
                  ))}
                </div>
              </button>
            ))}
          </div>
        </article>

        <article className="calendar-card nutrition-calendar-card">
          <h2>체중 / 칼로리</h2>
          <div className="calendar-grid">
            {days.map((day) => (
              <button
                className={`calendar-day nutrition-day ${selectedDay?.date === day.date ? "active" : ""}`}
                key={day.date}
                type="button"
                onClick={() => setSelectedDay(day)}
              >
                <span>{day.dayLabel}</span>
                <strong>{day.weight.weightKg ? day.weight.weightKg.toFixed(1) : day.dayOfMonth}</strong>
                <p>
                  <b>칼</b> {Math.round(day.nutrition.caloriesKcal || 0).toLocaleString("ko-KR")}
                </p>
                <p>
                  <b>탄</b> {day.nutrition.carbsG.toFixed(1)}
                </p>
                <p>
                  <b>단</b> {day.nutrition.proteinG.toFixed(1)}
                </p>
                <p>
                  <b>지</b> {day.nutrition.fatG.toFixed(1)}
                </p>
              </button>
            ))}
          </div>
        </article>

        <article className="calendar-card body-calendar-card">
          <h2>신체</h2>
          <div className="calendar-grid">
            {days.map((day) => (
              <button
                className={`calendar-day body-day ${selectedDay?.date === day.date ? "active" : ""}`}
                key={day.date}
                type="button"
                onClick={() => setSelectedDay(day)}
              >
                <span>{day.dayLabel}</span>
                <strong>{day.weight.weightKg ? day.weight.weightKg.toFixed(1) : day.dayOfMonth}</strong>
                <i />
                <p>{day.weight.skeletalMuscleKg ? `${day.weight.skeletalMuscleKg.toFixed(1)}kg` : "-"}</p>
                <p>{day.weight.bodyFatPercent ? `${day.weight.bodyFatPercent.toFixed(1)}%` : "-"}</p>
              </button>
            ))}
          </div>
        </article>
      </div>

      {selectedDay ? (
      <div className="calendar-day-layer open">
        <button className="calendar-layer-backdrop" type="button" aria-label="하루 상세 닫기" onClick={() => setSelectedDay(null)} />
        <section className="calendar-bottom-sheet calendar-day-sheet" role="dialog" aria-modal="true" aria-label="하루 상세">
            <span className="sheet-handle" aria-hidden="true" />
            <header>
              <div>
                <span>{selectedDay.date}</span>
                <h2>{selectedDay.dayLabel}요일 기록</h2>
              </div>
              <button type="button" aria-label="닫기" onClick={() => setSelectedDay(null)}>
                <FaIcon name="times" size={20} />
              </button>
            </header>
            <div className="calendar-day-summary">
              <article>
                <span>식사</span>
                <strong>{selectedDay.meals.length}개</strong>
              </article>
              <article>
                <span>섭취</span>
                <strong>{formatKcal(selectedDay.nutrition.caloriesKcal)}</strong>
              </article>
              <article>
                <span>체중</span>
                <strong>{selectedDay.weight.weightKg ? `${selectedDay.weight.weightKg.toFixed(1)}kg` : "-"}</strong>
              </article>
            </div>
            <div className="calendar-day-lines">
              {selectedDay.meals.length ? (
                selectedDay.meals.map((meal) => (
                  <p key={meal.id}>
                    <i className={mealBarClass[meal.mealType]} />
                    <span>{mealTypeLabel(meal.mealType)}</span>
                    <strong>{formatKcal(meal.caloriesKcal)}</strong>
                  </p>
                ))
              ) : (
                <p>
                  <i />
                  <span>식단 기록 없음</span>
                  <strong>-</strong>
                </p>
              )}
              {selectedDay.exercises.map((exercise) => (
                <p key={exercise.id}>
                  <i className="exercise" />
                  <span>{exercise.name}</span>
                  <strong>{exercise.durationMinutes}분</strong>
                </p>
              ))}
            </div>
          </section>
      </div>
      ) : null}
    </section>
  );
}

export default function App() {
  const currentTimeLabel = useCurrentTimeLabel();
  const [authReady, setAuthReady] = useState(false);
  const [authSession, setAuthSession] = useState<AuthSession | null>(null);
  const appReady = authReady && Boolean(authSession?.profileComplete);
  const {
    calendarSummary,
    dashboard,
    mealInsights,
    weightDashboard,
    recoverySummary,
    recommendationTabs,
    recommendations,
    loading,
    error,
    refresh,
  } = useEcobiData(appReady);
  const [activeScreen, setActiveScreen] = useState<Screen>("home");
  const [recordMode, setRecordMode] = useState<RecordMode>("diet");
  const [recordTab, setRecordTab] = useState<RecordTab>("search");
  const [mealPeriod, setMealPeriod] = useState<MealPeriod>("week");
  const [weightRange, _setWeightRange] = useState<WeightRange>("week");
  const [recommendationTab, setRecommendationTab] = useState<RecommendationTab>("personal");
  const [recommendationMealType, setRecommendationMealType] = useState<MealType>("dinner");
  const [recommendationMealBudgetDraft, setRecommendationMealBudgetDraft] = useState("");
  const [appliedMealBudgetKrw, setAppliedMealBudgetKrw] = useState<number | null>(null);
  const [recommendationLoading, setRecommendationLoading] = useState(false);
  const [recommendationCalorieWarning, setRecommendationCalorieWarning] = useState("");
  const [submittedRecommendationRequest, setSubmittedRecommendationRequest] = useState<SubmittedRecommendationRequest | null>(null);
  const [recommendationAiExplanations, setRecommendationAiExplanations] = useState<Record<number, RecommendationAiExplanation>>({});
  const [recommendationAiLoadingIds, setRecommendationAiLoadingIds] = useState<Set<number>>(new Set());
  const [periodStart, setPeriodStart] = useState(() => addDays(todayISO(), -6));
  const [periodEnd, setPeriodEnd] = useState(() => todayISO());
  const [periodSummary, setPeriodSummary] = useState<PeriodMealSummary | null>(null);
  const [periodLoading, setPeriodLoading] = useState(false);
  const [activeRecommendations, setActiveRecommendations] = useState<Recommendation[]>([]);
  const [activeWeightDashboard, setActiveWeightDashboard] = useState<WeightDashboard | null>(null);
  const [weeklyPlan, setWeeklyPlan] = useState<WeeklyPlanSummary | null>(null);
  const [weeklyPlanNotice, setWeeklyPlanNotice] = useState("");
  const [refreshingWeeklyMealIds, setRefreshingWeeklyMealIds] = useState<Set<number>>(new Set());
  const [recoveryPlans, setRecoveryPlans] = useState<RecoveryPlanRevision[]>([]);
  const [selectedMealType, setSelectedMealType] = useState<MealType>("dinner");
  const [searchQuery, setSearchQuery] = useState("");
  const [catalogSearchQuery, setCatalogSearchQuery] = useState("");
  const [recordExactSearch, setRecordExactSearch] = useState(false);
  const [catalogExactSearch, setCatalogExactSearch] = useState(false);
  const [catalogFoods, setCatalogFoods] = useState<Food[]>([]);
  const [catalogFoodLoading, setCatalogFoodLoading] = useState(false);
  const [catalogFoodHasMore, setCatalogFoodHasMore] = useState(false);
  const [recordFoods, setRecordFoods] = useState<Food[]>([]);
  const [recordFoodLoading, setRecordFoodLoading] = useState(false);
  const [recordFoodHasMore, setRecordFoodHasMore] = useState(false);
  const [activeModal, setActiveModal] = useState<ModalType | null>(null);
  const [saving, setSaving] = useState(false);
  const [goalDraft, setGoalDraft] = useState<GoalType>("cut");
  const [sexDraft, setSexDraft] = useState<"male" | "female">("female");
  const [allergyDraft, setAllergyDraft] = useState<string[]>([]);
  const [favoriteFoodIds, setFavoriteFoodIds] = useState<Set<number>>(new Set());
  const [completedPlans, setCompletedPlans] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      return new Set(JSON.parse(window.localStorage.getItem("ecobi.recoveryPlans") ?? "[]"));
    } catch {
      return new Set();
    }
  });
  const [weightInput, setWeightInput] = useState("");
  const [notice, setNotice] = useState("");
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [catalogDrawerOpen, setCatalogDrawerOpen] = useState(false);
  const [mealRecordSheetOpen, setMealRecordSheetOpen] = useState(false);
  const [recoveryPlanSheetOpen, setRecoveryPlanSheetOpen] = useState(false);
  const [showAllRecommendations, setShowAllRecommendations] = useState(false);
  const [showWeeklyPlan, setShowWeeklyPlan] = useState(false);
  const [selectedRecommendationId, setSelectedRecommendationId] = useState<number | null>(null);
  const [recommendationFeedback, setRecommendationFeedback] = useState<Partial<Record<number, RecommendationReaction>>>({});
  const [recordedRecommendationIds, setRecordedRecommendationIds] = useState<Set<number>>(new Set());
  const [recommendationMotion, setRecommendationMotion] = useState<RecommendationMotion | null>(null);
  const [recommendationDrawOpen, setRecommendationDrawOpen] = useState(false);
  const [skippedTodayRecommendationIds, setSkippedTodayRecommendationIds] = useState<Set<number>>(new Set());
  const [recommendationScrollNonce, setRecommendationScrollNonce] = useState(0);
  const [budgetDraft, setBudgetDraft] = useState("");
  const [mealAddedToast, setMealAddedToast] = useState<MealAddedToast | null>(null);
  const [successAnimationCue, setSuccessAnimationCue] = useState<SuccessAnimationCue | null>(null);
  const [pendingRecommendationRecord, setPendingRecommendationRecord] = useState<PendingRecommendationRecord | null>(null);
  const [pendingMealDeletions, setPendingMealDeletions] = useState<MealLog[]>([]);
  const recommendationPanelRef = useRef<HTMLElement | null>(null);
  const skippedRecommendationIdsRef = useRef<Set<number>>(new Set());
  const openDrawAfterRecommendationLoadRef = useRef(false);
  const pendingMealDeleteTimers = useRef<Map<number, number>>(new Map());

  useEffect(() => {
    AOS.init({
      once: false,
      duration: 420,
      easing: "ease-out-cubic",
      offset: 18,
      disable: () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    });
  }, []);

  useEffect(() => {
    const refreshId = window.setTimeout(() => AOS.refreshHard(), 80);
    return () => window.clearTimeout(refreshId);
  }, [activeScreen, catalogDrawerOpen, mealRecordSheetOpen, quickAddOpen, recoveryPlanSheetOpen, showAllRecommendations, showWeeklyPlan]);

  useEffect(() => {
    const storedSession = readStoredAuthSession();
    if (!storedSession) {
      setAuthReady(true);
      return;
    }

    let cancelled = false;
    getAuthMe()
      .then((session) => {
        if (cancelled) return;
        writeStoredAuthSession(toStoredAuthSession(session));
        setAuthSession(session);
      })
      .catch(() => {
        clearStoredAuthSession();
        if (!cancelled) setAuthSession(null);
      })
      .finally(() => {
        if (!cancelled) setAuthReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(
    () => () => {
      pendingMealDeleteTimers.current.forEach((timerId) => window.clearTimeout(timerId));
      pendingMealDeleteTimers.current.clear();
    },
    [],
  );

  function completeAuth(session: AuthSession) {
    writeStoredAuthSession(toStoredAuthSession(session));
    setAuthSession(session);
    setAuthReady(true);
  }

  function handleLogout() {
    clearStoredAuthSession();
    setAuthSession(null);
    setAuthReady(true);
    setActiveModal(null);
    setQuickAddOpen(false);
    setCatalogDrawerOpen(false);
    setMealRecordSheetOpen(false);
    setRecommendationDrawOpen(false);
    setPendingRecommendationRecord(null);
    setRecoveryPlanSheetOpen(false);
    setActiveScreen("home");
    setNotice("");
  }

  const recommendationViewModels = useMemo(() => {
    if (!dashboard) return [];
    const source = activeRecommendations.length ? activeRecommendations : recommendations.length ? recommendations : dashboard.recommendations;
    const viewModels = buildRecommendationViewModels(source, recommendationTab, dashboard);
    const seen = new Set<string>();
    return viewModels.filter((item) => {
      const key = item.title.trim().toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [activeRecommendations, dashboard, recommendationTab, recommendations]);
  const selectableRecommendationViewModels = useMemo(
    () => recommendationViewModels.filter((item) => !skippedTodayRecommendationIds.has(item.id)),
    [recommendationViewModels, skippedTodayRecommendationIds],
  );
  const availableRecommendationViewModels = useMemo(() => {
    const minimumVisibleCount = Math.min(3, recommendationViewModels.length);
    if (!selectableRecommendationViewModels.length) return recommendationViewModels;
    if (selectableRecommendationViewModels.length >= minimumVisibleCount) return selectableRecommendationViewModels;
    const skippedFillers = recommendationViewModels.filter((item) => skippedTodayRecommendationIds.has(item.id));
    return [...selectableRecommendationViewModels, ...skippedFillers];
  }, [recommendationViewModels, selectableRecommendationViewModels, skippedTodayRecommendationIds]);
  const additionalRecommendationViewModels = useMemo(() => {
    return getAdditionalRecommendationItems(availableRecommendationViewModels, selectedRecommendationId, 5).filter((item) => !skippedTodayRecommendationIds.has(item.id));
  }, [availableRecommendationViewModels, selectedRecommendationId, skippedTodayRecommendationIds]);
  const recommendationTabOptions = recommendationTabs.length ? recommendationTabs : fallbackRecommendationTabs;

  useEffect(() => {
    if (!recommendationViewModels.length) {
      setSelectedRecommendationId(null);
      return;
    }
    if (selectableRecommendationViewModels.length && !selectableRecommendationViewModels.some((item) => item.id === selectedRecommendationId)) {
      setSelectedRecommendationId(selectableRecommendationViewModels[0].id);
      return;
    }
    if (!selectableRecommendationViewModels.length && !recommendationViewModels.some((item) => item.id === selectedRecommendationId)) {
      setSelectedRecommendationId(recommendationViewModels[0].id);
    }
  }, [recommendationViewModels, selectableRecommendationViewModels, selectedRecommendationId]);

  useEffect(() => {
    skippedRecommendationIdsRef.current = skippedTodayRecommendationIds;
  }, [skippedTodayRecommendationIds]);

  useEffect(() => {
    if (!recommendationScrollNonce || activeScreen !== "recommend" || recommendationLoading) return;
    const timerId = window.setTimeout(() => {
      const panel = recommendationPanelRef.current;
      if (!panel) return;
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      panel.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "center" });
    }, 80);
    return () => window.clearTimeout(timerId);
  }, [activeScreen, recommendationLoading, recommendationScrollNonce]);

  useEffect(() => {
    setShowAllRecommendations(false);
    const emptySkippedIds = new Set<number>();
    skippedRecommendationIdsRef.current = emptySkippedIds;
    setSkippedTodayRecommendationIds(emptySkippedIds);
  }, [recommendationTab]);

  useEffect(() => {
    if (!appReady || !dashboard) return;
    let cancelled = false;
    setPeriodLoading(true);
    getMealSummary({ startDate: periodStart, endDate: periodEnd })
      .then((summary) => {
        if (!cancelled) setPeriodSummary(summary);
      })
      .catch((err) => {
        if (!cancelled) setNotice(err instanceof Error ? err.message : "식단 기록을 불러오지 못했어요.");
      })
      .finally(() => {
        if (!cancelled) setPeriodLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [appReady, dashboard, periodEnd, periodStart]);

  useEffect(() => {
    if (submittedRecommendationRequest || activeRecommendations.length) return;
    setActiveRecommendations(recommendations);
  }, [activeRecommendations.length, recommendations, submittedRecommendationRequest]);

  useEffect(() => {
    if (!dashboard) return;
    const suggestedBudget = estimateMealBudget(dashboard, recommendationMealType);
    setRecommendationMealBudgetDraft((current) => current || String(suggestedBudget));
  }, [dashboard, recommendationMealType]);

  useEffect(() => {
    if ((dashboard?.today.remainingCaloriesKcal ?? 0) > 0) {
      setRecommendationCalorieWarning("");
    }
  }, [dashboard?.today.remainingCaloriesKcal]);

  useEffect(() => {
    setActiveWeightDashboard(weightDashboard);
  }, [weightDashboard]);

  useEffect(() => {
    if (!dashboard) return;
    let cancelled = false;
    getWeightDashboard({ rangeType: weightRange })
      .then((nextDashboard) => {
        if (!cancelled) setActiveWeightDashboard(nextDashboard);
      })
      .catch((err) => {
        if (!cancelled) setNotice(err instanceof Error ? err.message : "체중 대시보드를 불러오지 못했어요.");
      });
    return () => {
      cancelled = true;
    };
  }, [dashboard, weightRange]);

  useEffect(() => {
    if (!submittedRecommendationRequest) return;
    let cancelled = false;
    const controller = new AbortController();
    setRecommendationLoading(true);
    loadRecommendationsViaJob(
      submittedRecommendationRequest.mealType,
      {
        intent: submittedRecommendationRequest.intent,
        limit: 15,
        mealSequence: submittedRecommendationRequest.mealSequence,
        targetMealBudgetKrw: submittedRecommendationRequest.targetMealBudgetKrw,
        targetMealCaloriesKcal: submittedRecommendationRequest.targetMealCaloriesKcal,
        todayBudgetKrw: submittedRecommendationRequest.todayBudgetKrw,
      },
      controller.signal,
    )
      .then((nextRecommendations) => {
        if (cancelled) return;
        setActiveRecommendations(nextRecommendations);
        const emptySkippedIds = new Set<number>();
        skippedRecommendationIdsRef.current = emptySkippedIds;
        setSkippedTodayRecommendationIds(emptySkippedIds);
        setShowAllRecommendations(false);
        if (nextRecommendations.length) {
          setRecommendationScrollNonce(Date.now());
        }
        if (openDrawAfterRecommendationLoadRef.current && nextRecommendations.length) {
          setRecommendationDrawOpen(true);
        }
        openDrawAfterRecommendationLoadRef.current = false;
      })
      .catch((err) => {
        if (!cancelled && !isAbortError(err)) setNotice(recommendationErrorMessage(err, "추천 식단을 불러오지 못했어요."));
        openDrawAfterRecommendationLoadRef.current = false;
      })
      .finally(() => {
        if (!cancelled) setRecommendationLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [submittedRecommendationRequest]);

  useEffect(() => {
    if (!dashboard) return;
    let cancelled = false;
    Promise.all([getWeeklyPlan(), listRecoveryPlans()])
      .then(([nextPlan, nextRecoveryPlans]) => {
        if (cancelled) return;
        setWeeklyPlan(nextPlan);
        setRecoveryPlans(nextRecoveryPlans);
      })
      .catch((err) => {
        if (!cancelled) setNotice(recommendationErrorMessage(err, "계획 데이터를 불러오지 못했어요."));
      });
    return () => {
      cancelled = true;
    };
  }, [dashboard]);

  useEffect(() => {
    if (dashboard) setBudgetDraft(String(dashboard.profile.weeklyBudgetKrw));
  }, [dashboard?.profile.weeklyBudgetKrw]);

  useEffect(() => {
    if (!mealAddedToast) return undefined;
    const timerId = window.setTimeout(() => setMealAddedToast(null), 1800);
    return () => window.clearTimeout(timerId);
  }, [mealAddedToast]);

  useEffect(() => {
    if (!successAnimationCue) return undefined;
    const timerId = window.setTimeout(() => setSuccessAnimationCue(null), 1650);
    return () => window.clearTimeout(timerId);
  }, [successAnimationCue]);

  useEffect(() => {
    if (!catalogDrawerOpen) return undefined;
    let cancelled = false;
    setCatalogFoodLoading(true);
    const timerId = window.setTimeout(() => {
      searchFoods({
        q: catalogSearchQuery,
        exact: catalogExactSearch,
        limit: 40,
      })
        .then((result) => {
          if (cancelled) return;
          setCatalogFoods(result.items);
          setCatalogFoodHasMore(result.hasMore);
        })
        .catch((err) => {
          if (!cancelled) {
            setCatalogFoods([]);
            setCatalogFoodHasMore(false);
            setNotice(err instanceof Error ? err.message : "음식 검색 결과를 불러오지 못했어요.");
          }
        })
        .finally(() => {
          if (!cancelled) setCatalogFoodLoading(false);
        });
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timerId);
    };
  }, [catalogDrawerOpen, catalogExactSearch, catalogSearchQuery]);

  useEffect(() => {
    if (!mealRecordSheetOpen || recordTab === "manual" || !dashboard) {
      setRecordFoodLoading(false);
      return undefined;
    }

    const recentFoodIds = [
      ...dashboard.today.meals,
      ...dashboard.weeklyMeals.byDate.flatMap((day) => day.meals),
      ...(mealInsights?.recentMeals ?? []),
    ].map((meal) => meal.food.id);
    const recordFavoriteIds = [...new Set([...dashboard.profile.favoriteFoodIds, ...favoriteFoodIds])];

    if (recordTab === "recent" && !recentFoodIds.length) {
      setRecordFoods([]);
      setRecordFoodHasMore(false);
      setRecordFoodLoading(false);
      return undefined;
    }
    if (recordTab === "preferred" && !recordFavoriteIds.length) {
      setRecordFoods([]);
      setRecordFoodHasMore(false);
      setRecordFoodLoading(false);
      return undefined;
    }

    let cancelled = false;
    setRecordFoodLoading(true);
    const timerId = window.setTimeout(() => {
      searchFoods({
        q: searchQuery,
        exact: recordExactSearch,
        limit: 40,
        ids: recordTab === "recent" ? recentFoodIds : recordTab === "preferred" ? recordFavoriteIds : undefined,
      })
        .then((result) => {
          if (cancelled) return;
          setRecordFoods(result.items);
          setRecordFoodHasMore(result.hasMore);
        })
        .catch((err) => {
          if (!cancelled) {
            setRecordFoods([]);
            setRecordFoodHasMore(false);
            setNotice(err instanceof Error ? err.message : "식품 검색 결과를 불러오지 못했어요.");
          }
        })
        .finally(() => {
          if (!cancelled) setRecordFoodLoading(false);
        });
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timerId);
    };
  }, [dashboard, favoriteFoodIds, mealInsights, mealRecordSheetOpen, recordExactSearch, recordTab, searchQuery]);

  if (!authReady) {
    return (
      <main className="phone-shell" aria-label="예산 기반 다이어트 앱">
        <section className="screen active">
          <article className="white-card centered">
            <strong>확인 중</strong>
            <span>로그인 상태를 확인하고 있어요.</span>
          </article>
        </section>
      </main>
    );
  }

  if (!authSession?.profileComplete) {
    return <AuthOnboarding initialSession={authSession} onComplete={completeAuth} />;
  }

  if (loading && !dashboard) {
    return (
      <main className="phone-shell" aria-label="예산 기반 다이어트 앱">
        <div className="status-bar" aria-hidden="true">
          <span>{currentTimeLabel}</span>
          <span className="signal">▮▮▮ 4G ▱</span>
        </div>
        <section className="screen active">
          <article className="white-card centered">
            <strong>불러오는 중</strong>
            <span>Ecobi 데이터를 준비하고 있어요.</span>
          </article>
        </section>
      </main>
    );
  }

  if (error || !dashboard) {
    return (
      <main className="phone-shell" aria-label="예산 기반 다이어트 앱">
        <section className="screen active">
          <article className="white-card centered">
            <strong>연결 오류</strong>
            <span>{error ?? "API 연결을 확인해 주세요."}</span>
          </article>
        </section>
      </main>
    );
  }

  const activeDashboard = dashboard;
  const latestWeightDashboard = activeWeightDashboard ?? weightDashboard;
  const weightRecordsForDisplay = latestWeightDashboard?.records ?? [];
  const recordWeightChartPoints = latestWeightDashboard?.chart ?? dashboard.weight.chart;
  const bodyMetricRecords = weightRecordsForDisplay.filter((record) => record.bodyFatPercent !== null || record.skeletalMuscleKg !== null).slice(0, 4);
  const calorieProgress = Math.min((activeDashboard.today.caloriesKcal / activeDashboard.profile.targetCaloriesKcal) * 100, 100);
  const budgetProgress =
    activeDashboard.profile.weeklyBudgetKrw > 0
      ? Math.min((activeDashboard.weeklyMeals.spentMoneyKrw / activeDashboard.profile.weeklyBudgetKrw) * 100, 100)
      : 0;
  const todayDate = todayISO();
  const monthDay = todayDate.slice(5).replace("-", ".");
  const recordDateLabel =
    periodStart === periodEnd
      ? `${shortDate(periodStart)} ${periodStart === todayDate ? "오늘" : "조회 중"}`
      : `${shortDate(periodStart)}-${shortDate(periodEnd)} 조회 중`;
  const dashboardWeek = getDashboardWeek(todayDate);
  const currentWeightValue = weightInput || dashboard.weight.currentWeightKg.toFixed(1);
  const budgetDraftNumber = Number(budgetDraft || dashboard.profile.weeklyBudgetKrw);
  const normalizedBudgetDraft = Number.isFinite(budgetDraftNumber) ? budgetDraftNumber : dashboard.profile.weeklyBudgetKrw;
  const displayPreferredFoods = userFacingPreferences(dashboard.profile.preferredFoods);
  const displayDislikedFoods = dashboard.profile.dislikedFoods.filter(Boolean);
  const allergySummary = dashboard.profile.allergies.length ? dashboard.profile.allergies.join(", ") : "없음";
  const effectiveFavoriteFoodIds = new Set([...dashboard.profile.favoriteFoodIds, ...favoriteFoodIds]);
  const pendingMealIds = new Set(pendingMealDeletions.map((meal) => meal.id));
  const latestPendingMeal = pendingMealDeletions[pendingMealDeletions.length - 1];
  const defaultRecordTab: RecordTab = "search";
  const suggestedRecommendationBudgetKrw = estimateMealBudget(dashboard, recommendationMealType);
  const activeRecommendationBudgetKrw = appliedMealBudgetKrw ?? suggestedRecommendationBudgetKrw;

  function splitInputList(value: FormDataEntryValue | null) {
    return String(value ?? "")
      .split(/[,，\n]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function changeRecommendationMealType(nextMealType: MealType) {
    setRecommendationMealType(nextMealType);
    const nextBudget = estimateMealBudget(activeDashboard, nextMealType);
    setRecommendationMealBudgetDraft(String(nextBudget));
    setAppliedMealBudgetKrw(null);
  }

  function changeRecommendationTab(nextTab: RecommendationTab) {
    setRecommendationTab(nextTab);
  }

  function showWeeklyPlanNotice(message: string) {
    setWeeklyPlanNotice(message);
    setNotice(message);
    window.setTimeout(() => setWeeklyPlanNotice(message), 0);
  }

  async function loadRecommendationsViaJob(
    mealType: MealType,
    options: Parameters<typeof createRecommendationJob>[1],
    signal?: AbortSignal,
  ) {
    const job = await createRecommendationJob(mealType, options, { signal });
    const completed = await waitForRecommendationJob(job.runId, { signal });
    return completed.recommendations;
  }

  function isAbortError(error: unknown) {
    return error instanceof DOMException && error.name === "AbortError";
  }

  function recommendationErrorMessage(error: unknown, fallback: string) {
    const message = error instanceof Error ? error.message : fallback;
    return message === "서버 오류가 발생했습니다." ? "" : message;
  }

  function requestBudgetRecommendations(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedBudget = normalizeMoneyInput(recommendationMealBudgetDraft);
    const parsedBudget = Number(normalizedBudget);
    if (!normalizedBudget || !Number.isFinite(parsedBudget) || parsedBudget <= 0) {
      setNotice("이번 끼니에 쓸 예산을 입력해 주세요.");
      return;
    }
    setRecommendationMealBudgetDraft(normalizedBudget);
    setAppliedMealBudgetKrw(parsedBudget);
    setRecommendationCalorieWarning(activeDashboard.today.remainingCaloriesKcal <= 0 ? recommendationCalorieLimitWarning() : "");
    openDrawAfterRecommendationLoadRef.current = false;
    setSubmittedRecommendationRequest({
      requestId: Date.now(),
      mealType: recommendationMealType,
      intent: recommendationTab,
      mealSequence: mealSequenceFor(recommendationMealType, activeDashboard.today.mealCount),
      targetMealBudgetKrw: parsedBudget,
      targetMealCaloriesKcal: estimateMealCalories(activeDashboard, recommendationMealType),
      todayBudgetKrw: activeDashboard.today.remainingBudgetKrw,
    });
  }

  function openModal(type: ModalType) {
    setGoalDraft(activeDashboard.profile.goalType);
    setSexDraft(activeDashboard.profile.sex);
    setAllergyDraft(activeDashboard.profile.allergies);
    setActiveModal(type);
  }

  async function saveChange(action: () => Promise<unknown>, message: string) {
    setSaving(true);
    try {
      await action();
      setNotice(message);
      setActiveModal(null);
      await refresh();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "저장하지 못했어요.");
    } finally {
      setSaving(false);
    }
  }

  function trackInteraction(input: Parameters<typeof createInteraction>[0]) {
    void createInteraction(input).catch(() => undefined);
  }

  function optionalFormNumber(value: FormDataEntryValue | null) {
    const raw = String(value ?? "").trim();
    if (!raw) return undefined;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  function showSuccessAnimation(tone: SuccessAnimationTone = "meal") {
    setSuccessAnimationCue({ id: Date.now(), tone });
  }

  function showMealAddedToast(title: string, tone: SuccessAnimationTone = "meal") {
    setMealAddedToast({ id: Date.now(), title: `${title} 추가했어요.`, helper: "식단 기록에 반영됐어요." });
    showSuccessAnimation(tone);
  }

  async function reloadPeriodSummary() {
    setPeriodLoading(true);
    try {
      setPeriodSummary(await getMealSummary({ startDate: periodStart, endDate: periodEnd }));
    } finally {
      setPeriodLoading(false);
    }
  }

  async function recordFood(food: Food, mealType: MealType = selectedMealType) {
    await createMeal({
      foodId: food.id,
      mealType,
      consumedAt: consumedAtForMealType(mealType),
      quantityLabel: "1인분",
      spentMoneyKrw: food.priceKrw,
    });
    trackInteraction({
      foodId: food.id,
      interactionType: "logged",
      interactionWeight: 2,
      metadata: { source: "manual_food_record", mealType },
    });
    setNotice("");
    showMealAddedToast(food.name);
    await refresh();
    await reloadPeriodSummary();
    openRecord("diet");
  }

  function requestRecommendationRecord(recommendation: Recommendation, options: { openRecordAfter?: boolean } = {}) {
    setPendingRecommendationRecord({
      recommendation,
      openRecordAfter: options.openRecordAfter ?? true,
    });
  }

  function requestWeeklyPlanMealRecord(meal: WeeklyPlanMeal) {
    if (!meal.candidate) return;
    requestRecommendationRecord({ ...meal.candidate, mealType: meal.mealType }, { openRecordAfter: false });
  }

  async function recordRecommendation(recommendation: Recommendation, mealType: MealType, options: { openRecordAfter?: boolean } = {}) {
    await logRecommendation(recommendation.id, {
      mealType,
      consumedAt: consumedAtForMealType(mealType),
    });
    await createInteraction({
      candidateId: recommendation.id,
      interactionType: "logged",
      interactionWeight: 3,
      metadata: { source: "recommendation_record", mealType },
    });
    setRecordedRecommendationIds((previous) => new Set(previous).add(recommendation.id));
    setRecommendationFeedback((previous) => ({ ...previous, [recommendation.id]: "accepted" }));
    setRecommendationMotion({ candidateId: recommendation.id, type: "logged", nonce: Date.now() });
    setNotice("");
    showMealAddedToast(recommendation.name, "recommendation");
    await refresh();
    await reloadPeriodSummary();
    if (options.openRecordAfter ?? true) openRecord("diet");
  }

  async function confirmRecommendationRecord(mealType: MealType) {
    if (!pendingRecommendationRecord) return;
    const pending = pendingRecommendationRecord;
    setPendingRecommendationRecord(null);
    try {
      await recordRecommendation(pending.recommendation, mealType, { openRecordAfter: pending.openRecordAfter });
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "추천 식단을 기록하지 못했어요.");
    }
  }

  async function recordManualMeal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const foodName = String(form.get("foodName") ?? "").trim();
    const formMealType = String(form.get("mealType") ?? "");
    const mealType = mealTypes.includes(formMealType as MealType) ? (formMealType as MealType) : selectedMealType;
    try {
      await createMeal({
        foodName,
        mealType,
        consumedAt: consumedAtForMealType(mealType),
        quantityLabel: String(form.get("quantityLabel") ?? "").trim() || "1인분",
        spentMoneyKrw: optionalFormNumber(form.get("spentMoneyKrw")) ?? 0,
        caloriesKcal: optionalFormNumber(form.get("caloriesKcal")) ?? 0,
        proteinG: optionalFormNumber(form.get("proteinG")) ?? 0,
        fatG: optionalFormNumber(form.get("fatG")) ?? 0,
        carbsG: optionalFormNumber(form.get("carbsG")) ?? 0,
        sourceType: "manual_custom",
      });
      formElement.reset();
      setMealRecordSheetOpen(false);
      setNotice("");
      showMealAddedToast(foodName);
      await refresh();
      await reloadPeriodSummary();
      openRecord("diet");
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "직접 입력 식단을 기록하지 못했어요.");
    }
  }

  async function submitWeight(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const optionalNumber = (value: FormDataEntryValue | null) => {
      const raw = String(value ?? "").trim();
      if (!raw) return undefined;
      const parsed = Number(raw);
      return Number.isFinite(parsed) ? parsed : undefined;
    };
    await createWeight({
      measuredAt: String(form.get("measuredAt")),
      weightKg: Number(currentWeightValue),
      heightCm: dashboard!.profile.heightCm,
      bodyFatPercent: optionalNumber(form.get("bodyFatPercent")),
      skeletalMuscleKg: optionalNumber(form.get("skeletalMuscleKg")),
      note: String(form.get("note") ?? ""),
    });
    setNotice("체중 기록을 저장했어요.");
    setWeightInput("");
    setActiveWeightDashboard(await getWeightDashboard({ rangeType: weightRange }));
    await refresh();
  }

  async function commitMealDeletion(meal: MealLog) {
    pendingMealDeleteTimers.current.delete(meal.id);
    try {
      await deleteMeal(meal.id);
      if (meal.sourceType !== "manual_custom") {
        trackInteraction({
          foodId: meal.food.id,
          interactionType: "deleted",
          interactionWeight: -1,
          metadata: { source: "meal_history", mealType: meal.mealType },
        });
      }
      await reloadPeriodSummary();
      await refresh();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "식단 기록을 삭제하지 못했어요.");
    } finally {
      setPendingMealDeletions((current) => current.filter((item) => item.id !== meal.id));
    }
  }

  function removeMeal(meal: MealLog) {
    if (pendingMealDeleteTimers.current.has(meal.id)) return;
    setNotice("");
    setPendingMealDeletions((current) => [...current.filter((item) => item.id !== meal.id), meal]);
    const timerId = window.setTimeout(() => void commitMealDeletion(meal), 4800);
    pendingMealDeleteTimers.current.set(meal.id, timerId);
  }

  function undoMealDeletion(meal: MealLog) {
    const timerId = pendingMealDeleteTimers.current.get(meal.id);
    if (timerId) window.clearTimeout(timerId);
    pendingMealDeleteTimers.current.delete(meal.id);
    setPendingMealDeletions((current) => current.filter((item) => item.id !== meal.id));
    setNotice("삭제를 취소했어요.");
  }

  async function favoriteFood(food: Food) {
    const result = await toggleFoodFavorite(food.id);
    setFavoriteFoodIds((previous) => {
      const next = new Set(previous);
      if (result.favorited) next.add(food.id);
      else next.delete(food.id);
      return next;
    });
    trackInteraction({
      foodId: food.id,
      interactionType: result.favorited ? "accepted" : "rejected",
      interactionWeight: result.favorited ? 1 : -1,
      metadata: { source: "favorite_food_button" },
    });
    setNotice("");
    await refresh();
  }

  function selectRecommendationCandidate(recommendation: Recommendation) {
    setSelectedRecommendationId(recommendation.id);
    setRecommendationMotion({ candidateId: recommendation.id, type: "selected", nonce: Date.now() });
    trackInteraction({
      candidateId: recommendation.id,
      interactionType: "clicked",
      interactionWeight: 1,
      metadata: { source: "recommendation_choice_card", intent: recommendationTab },
    });
  }

  async function feedbackRecommendation(recommendation: Recommendation, feedback: RecommendationReaction) {
    try {
      if (feedback === "skipped") {
        void createInteraction({
          candidateId: recommendation.id,
          interactionType: "skipped",
          interactionWeight: 0,
          metadata: { source: "recommendation_today_skip", intent: recommendationTab, skippedDate: todayISO() },
        }).catch(() => undefined);

        setRecommendationMotion({ candidateId: recommendation.id, type: feedback, nonce: Date.now() });
        const nextSkippedIds = new Set(skippedRecommendationIdsRef.current);
        nextSkippedIds.add(recommendation.id);
        skippedRecommendationIdsRef.current = nextSkippedIds;
        setRecommendationFeedback((previous) => {
          const next = { ...previous };
          delete next[recommendation.id];
          return next;
        });
        const nextItem = findNextAvailableRecommendation(recommendationViewModels, nextSkippedIds, recommendation.id);
        window.setTimeout(() => {
          const latestSkippedIds = skippedRecommendationIdsRef.current;
          const safeNextItem =
            nextItem && !latestSkippedIds.has(nextItem.id)
              ? nextItem
              : findNextAvailableRecommendation(recommendationViewModels, latestSkippedIds, recommendation.id);
          setSkippedTodayRecommendationIds(new Set(latestSkippedIds));
          if (safeNextItem) {
            setSelectedRecommendationId(safeNextItem.id);
            setRecommendationMotion({ candidateId: safeNextItem.id, type: "selected", nonce: Date.now() });
          } else if (recommendationViewModels.length) {
            const firstItem = recommendationViewModels[0];
            setSelectedRecommendationId(firstItem.id);
            setRecommendationMotion({ candidateId: firstItem.id, type: "selected", nonce: Date.now() });
          } else {
            setSelectedRecommendationId(null);
            setRecommendationMotion(null);
          }
        }, 240);
        setNotice("");
        return;
      }

      if (feedback === "accepted") {
        await submitRecommendationFeedback(recommendation.id, {
          feedback: "accepted",
          metadata: { source: "recommendation_feedback", intent: recommendationTab },
        });
        setRecommendationFeedback((previous) => ({ ...previous, [recommendation.id]: feedback }));
      }
      setRecommendationMotion({ candidateId: recommendation.id, type: feedback, nonce: Date.now() });
      setNotice("");
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "추천 반응을 저장하지 못했어요.");
    }
  }

  async function explainRecommendationWithAi(recommendation: Recommendation) {
    if (recommendationAiLoadingIds.has(recommendation.id)) return;
    setRecommendationAiLoadingIds((previous) => new Set(previous).add(recommendation.id));
    setNotice("");
    try {
      const explanation = await getRecommendationAiExplanation(recommendation.id, { intent: recommendationTab });
      setRecommendationAiExplanations((previous) => ({ ...previous, [recommendation.id]: explanation }));
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "AI 추천 설명을 만들지 못했어요.");
    } finally {
      setRecommendationAiLoadingIds((previous) => {
        const next = new Set(previous);
        next.delete(recommendation.id);
        return next;
      });
    }
  }

  async function regenerateWeeklyPlan() {
    setWeeklyPlanNotice("");
    try {
      const nextPlan = await generateWeeklyPlan(todayISO());
      setWeeklyPlan(nextPlan);
      showWeeklyPlanNotice("주간 식단 계획을 다시 만들었어요.");
    } catch (err) {
      setWeeklyPlanNotice("");
      setNotice(recommendationErrorMessage(err, "주간 식단 계획을 만들지 못했어요."));
    }
  }

  async function refreshWeeklyPlanMeal(meal: WeeklyPlanMeal) {
    if (!dashboard) return;
    setWeeklyPlanNotice(`${mealTypeLabel(meal.mealType)} 후보를 찾는 중이에요.`);
    setRefreshingWeeklyMealIds((previous) => new Set(previous).add(meal.id));
    let resolvedWithMessage = false;
    try {
      const nextCandidates = await loadRecommendationsViaJob(meal.mealType, {
        intent: recommendationTab,
        limit: 7,
        mealSequence: mealSequenceFor(meal.mealType, dashboard.today.mealCount),
        targetMealBudgetKrw: Math.max(meal.plannedPriceKrw, estimateMealBudget(dashboard, meal.mealType), 1000),
        targetMealCaloriesKcal: estimateMealCalories(dashboard, meal.mealType),
        todayBudgetKrw: dashboard.today.remainingBudgetKrw,
      });
      if (!weeklyPlan || !weeklyPlan.meals.some((item) => item.id === meal.id)) {
        showWeeklyPlanNotice("현재 조건에서 다른 후보를 찾지 못했어요.");
        resolvedWithMessage = true;
        return;
      }
      const usedCandidateIds = new Set(weeklyPlan.meals.map((item) => item.candidate?.id).filter((id): id is number => typeof id === "number"));
      const currentDisplayKey = weeklyCandidateDisplayKey(meal.candidate);
      const replacement =
        nextCandidates.find((candidate) => !usedCandidateIds.has(candidate.id) && weeklyCandidateDisplayKey(candidate) !== currentDisplayKey) ??
        nextCandidates.find((candidate) => weeklyCandidateDisplayKey(candidate) !== currentDisplayKey) ??
        null;
      if (!replacement) {
        showWeeklyPlanNotice("현재 조건에서 다른 후보를 찾지 못했어요.");
        resolvedWithMessage = true;
        return;
      }
      setWeeklyPlan((current) => {
        if (!current) return current;
        return withWeeklyPlanTotals({
          ...current,
          meals: current.meals.map((item) =>
            item.id === meal.id
              ? {
                  ...item,
                  candidate: replacement,
                  plannedPriceKrw: replacement.totalPriceKrw,
                  plannedCaloriesKcal: replacement.totalCaloriesKcal,
                  plannedProteinG: replacement.totalProteinG,
                }
              : item,
          ),
        });
      });
      showWeeklyPlanNotice("다른 후보로 변경했어요.");
      resolvedWithMessage = true;
    } catch (err) {
      showWeeklyPlanNotice(err instanceof Error ? err.message : "후보를 바꾸지 못했어요.");
      resolvedWithMessage = true;
    } finally {
      if (!resolvedWithMessage) {
        showWeeklyPlanNotice("현재 조건에서 다른 후보를 찾지 못했어요.");
      }
      setRefreshingWeeklyMealIds((previous) => {
        const next = new Set(previous);
        next.delete(meal.id);
        return next;
      });
    }
  }

  async function createRecoveryFromShock(input: { eventType: ShockEventType; expectedSpendKrw: number; eventDayIndex: number; note?: string; referenceDate?: string }) {
    const referenceDate = input.referenceDate ?? todayISO();
    const revision = await createShockRecoveryPlan({ ...input, referenceDate });
    setRecoveryPlans((previous) => [revision, ...previous.filter((item) => item.id !== revision.id && item.shockEventId !== revision.shockEventId)].slice(0, 6));
    setWeeklyPlan(await getWeeklyPlan(referenceDate));
    setWeeklyPlanNotice("회복 플랜을 주간 계획에 반영했어요.");
    showSuccessAnimation("recovery");
    setNotice("");
  }

  async function deleteRecoveryEvent(revision: RecoveryPlanRevision) {
    try {
      await deleteShockRecoveryPlan(revision.shockEventId);
      setRecoveryPlans((previous) => previous.filter((item) => item.shockEventId !== revision.shockEventId));
      setNotice("");
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "예상 이벤트를 삭제하지 못했어요.");
    }
  }

  function toggleRecoveryPlan(planId: string, label: string) {
    const nextCompleted = !completedPlans.has(planId);
    const next = new Set(completedPlans);
    if (nextCompleted) next.add(planId);
    else next.delete(planId);
    setCompletedPlans(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("ecobi.recoveryPlans", JSON.stringify([...next]));
    }
    setNotice(nextCompleted ? `${label} 완료로 저장했어요.` : `${label} 완료를 해제했어요.`);
  }

  async function submitProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await saveChange(
      () =>
        updateProfile({
          displayName: String(form.get("displayName") ?? ""),
          email: String(form.get("email") ?? "") || null,
        }),
      "프로필을 저장했어요.",
    );
  }

  async function submitBudget(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await saveChange(() => updateBudget({ weeklyBudgetKrw: Number(form.get("weeklyBudgetKrw")) }), "주간 예산을 저장했어요.");
  }

  async function submitInlineBudget(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextBudget = Math.max(0, Math.round(normalizedBudgetDraft));
    setBudgetDraft(String(nextBudget));
    await saveChange(() => updateBudget({ weeklyBudgetKrw: nextBudget }), "주간 예산을 저장했어요.");
  }

  async function submitGoal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const targetCalorieDeltaKcal = goalCalorieDelta(goalDraft);
    await saveChange(
      () =>
        updateGoal({
          goalType: goalDraft,
          targetWeightKg: Number(form.get("targetWeightKg")),
          targetCaloriesKcal: goalTargetCalories(activeDashboard.profile, goalDraft),
          targetCalorieDeltaKcal,
          weeklyBudgetKrw: activeDashboard.profile.weeklyBudgetKrw,
        }),
      "목표를 저장했어요.",
    );
  }

  async function saveGoalType(goalType: GoalType) {
    setGoalDraft(goalType);
    await saveChange(
      () =>
        updateGoal({
          goalType,
          targetWeightKg: activeDashboard.profile.targetWeightKg,
          targetCaloriesKcal: goalTargetCalories(activeDashboard.profile, goalType),
          targetCalorieDeltaKcal: goalCalorieDelta(goalType),
          weeklyBudgetKrw: activeDashboard.profile.weeklyBudgetKrw,
        }),
      "목표를 저장했어요.",
    );
  }

  async function submitCalories(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await saveChange(
      () => updateCalories({ targetCaloriesKcal: Number(form.get("targetCaloriesKcal")) }),
      "칼로리 기준을 저장했어요.",
    );
  }

  async function submitBody(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await saveChange(
      () =>
        updateBody({
          heightCm: Number(form.get("heightCm")),
          weightKg: Number(form.get("weightKg")),
        }),
      "신체 정보를 저장했어요.",
    );
  }

  async function submitAge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await saveChange(
      () => updateDemographics({ ageYearsSnapshot: Number(form.get("ageYearsSnapshot")) }),
      "나이를 저장했어요.",
    );
  }

  async function submitAllergies(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const customAllergies = splitInputList(form.get("customAllergies"));
    await saveChange(
      () => updateAllergies({ allergies: [...allergyDraft, ...customAllergies] }),
      "알레르기 정보를 저장했어요.",
    );
  }

  async function submitPreferences(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await saveChange(
      () =>
        updatePreferences({
          preferredFoods: splitInputList(form.get("preferredFoods")),
          dislikedFoods: splitInputList(form.get("dislikedFoods")),
        }),
      "음식 선호도를 저장했어요.",
    );
  }

  function openRecord(mode: RecordMode) {
    setQuickAddOpen(false);
    setCatalogDrawerOpen(false);
    setMealRecordSheetOpen(false);
    setPendingRecommendationRecord(null);
    setRecommendationDrawOpen(false);
    setShowAllRecommendations(false);
    setShowWeeklyPlan(false);
    setActiveScreen("record");
    setRecordMode(mode);
    window.scrollTo(0, 0);
    window.requestAnimationFrame(() => window.scrollTo(0, 0));
  }

  function openDietRecordSheet() {
    setQuickAddOpen(false);
    setCatalogDrawerOpen(false);
    setRecommendationDrawOpen(false);
    setPendingRecommendationRecord(null);
    setShowAllRecommendations(false);
    setShowWeeklyPlan(false);
    setActiveScreen("record");
    setRecordMode("diet");
    setRecordTab(defaultRecordTab);
    setSearchQuery("");
    setMealRecordSheetOpen(true);
    window.scrollTo(0, 0);
    window.requestAnimationFrame(() => window.scrollTo(0, 0));
  }

  function _openRecommendationDraw() {
    setQuickAddOpen(false);
    setCatalogDrawerOpen(false);
    setMealRecordSheetOpen(false);
    setPendingRecommendationRecord(null);
    setShowAllRecommendations(false);
    setShowWeeklyPlan(false);
    setRecommendationDrawOpen(true);
  }

  function openScreen(screen: Screen) {
    setQuickAddOpen(false);
    setCatalogDrawerOpen(false);
    setMealRecordSheetOpen(false);
    setPendingRecommendationRecord(null);
    setRecommendationDrawOpen(false);
    if (screen !== "recommend") {
      setShowAllRecommendations(false);
      setShowWeeklyPlan(false);
    }
    setActiveScreen(screen);
    window.scrollTo(0, 0);
    window.requestAnimationFrame(() => window.scrollTo(0, 0));
  }

  function openRecoveryRecommendations() {
    setRecommendationTab("recovery");
    setShowAllRecommendations(false);
    setShowWeeklyPlan(false);
    openScreen("recommend");
  }

  function handleQuickAction(action: QuickAddAction) {
    if (action === "diet") {
      openDietRecordSheet();
      return;
    }
    openRecord(action);
  }

  function setMealPeriodPreset(period: MealPeriod) {
    const today = todayISO();
    setMealPeriod(period);
    if (period === "today") {
      setPeriodStart(today);
      setPeriodEnd(today);
    } else if (period === "week") {
      setPeriodStart(addDays(today, -6));
      setPeriodEnd(today);
    } else if (period === "recent") {
      setPeriodStart(addDays(today, -29));
      setPeriodEnd(today);
    }
  }

  function _openDietPeriod(period: MealPeriod) {
    setMealPeriodPreset(period);
    openRecord("diet");
  }

  function openTodayMealHistory() {
    setMealPeriodPreset("today");
    openRecord("diet");
  }

  function openDietDate(date: string) {
    setMealPeriod(date === todayISO() ? "today" : "custom");
    setPeriodStart(date);
    setPeriodEnd(date);
    openRecord("diet");
  }

  function adjustWeight(delta: number) {
    setWeightInput((previous) => (Number(previous || activeDashboard.weight.currentWeightKg) + delta).toFixed(1));
  }

  function renderModal() {
    if (!activeModal) return null;

    const closeButton = (
      <button type="button" aria-label="닫기" onClick={() => setActiveModal(null)}>
        ×
      </button>
    );

    return (
      <div className="entry-modal open" role="dialog" aria-modal="true">
        <div className="entry-sheet">
          {activeModal === "profile" ? (
            <form onSubmit={submitProfile}>
              <header>
                <h2>프로필 편집</h2>
                {closeButton}
              </header>
              <label>
                이름
                <input name="displayName" defaultValue={activeDashboard.profile.displayName} autoFocus />
              </label>
              <label>
                이메일
                <input name="email" type="email" defaultValue={activeDashboard.profile.email ?? ""} />
              </label>
              <button className="primary" type="submit" disabled={saving}>
                저장
              </button>
            </form>
          ) : null}

          {activeModal === "budget" ? (
            <form onSubmit={submitBudget}>
              <header>
                <h2>주간 식비</h2>
                {closeButton}
              </header>
              <label>
                이번 주 예산
                <input name="weeklyBudgetKrw" type="number" step="1000" defaultValue={activeDashboard.profile.weeklyBudgetKrw} autoFocus />
              </label>
              <button className="primary" type="submit" disabled={saving}>
                저장
              </button>
            </form>
          ) : null}

          {activeModal === "goal" ? (
            <form onSubmit={submitGoal}>
              <header>
                <h2>목표 설정</h2>
                {closeButton}
              </header>
              <div className="choice-list">
                {(["cut", "maintain", "bulk"] as GoalType[]).map((goalType) => (
                  <button
                    className={goalDraft === goalType ? "active" : ""}
                    key={goalType}
                    type="button"
                    onClick={() => setGoalDraft(goalType)}
                  >
                    {goalLabel(goalType)}
                  </button>
                ))}
              </div>
              <label>
                목표 체중
                <input name="targetWeightKg" type="number" step="0.1" defaultValue={activeDashboard.profile.targetWeightKg} />
              </label>
              <button className="primary" type="submit" disabled={saving}>
                저장
              </button>
            </form>
          ) : null}

          {activeModal === "calories" ? (
            <form onSubmit={submitCalories}>
              <header>
                <h2>칼로리 기준</h2>
                {closeButton}
              </header>
              <label>
                하루 목표 kcal
                <input
                  name="targetCaloriesKcal"
                  type="number"
                  step="10"
                  defaultValue={Math.round(activeDashboard.profile.targetCaloriesKcal)}
                  autoFocus
                />
              </label>
              <button className="primary" type="submit" disabled={saving}>
                저장
              </button>
            </form>
          ) : null}

          {activeModal === "body" ? (
            <form onSubmit={submitBody}>
              <header>
                <h2>신체 정보</h2>
                {closeButton}
              </header>
              <label>
                신장 cm
                <input name="heightCm" type="number" step="0.1" defaultValue={activeDashboard.profile.heightCm} autoFocus />
              </label>
              <label>
                현재 체중 kg
                <input name="weightKg" type="number" step="0.1" defaultValue={activeDashboard.weight.currentWeightKg} />
              </label>
              <button className="primary" type="submit" disabled={saving}>
                저장
              </button>
            </form>
          ) : null}

          {activeModal === "sex" ? (
            <>
              <header>
                <h2>성별</h2>
                {closeButton}
              </header>
              <div className="choice-list two">
                {(["female", "male"] as const).map((sex) => (
                  <button
                    className={sexDraft === sex ? "active" : ""}
                    key={sex}
                    type="button"
                    onClick={() => {
                      setSexDraft(sex);
                      void saveChange(() => updateDemographics({ sex }), "성별을 저장했어요.");
                    }}
                  >
                    {sex === "female" ? "여자" : "남자"}
                  </button>
                ))}
              </div>
            </>
          ) : null}

          {activeModal === "age" ? (
            <form onSubmit={submitAge}>
              <header>
                <h2>나이</h2>
                {closeButton}
              </header>
              <label>
                나이
                <input name="ageYearsSnapshot" type="number" defaultValue={activeDashboard.profile.ageYearsSnapshot} autoFocus />
              </label>
              <button className="primary" type="submit" disabled={saving}>
                저장
              </button>
            </form>
          ) : null}

          {activeModal === "allergies" ? (
            <form onSubmit={submitAllergies}>
              <header>
                <h2>알레르기</h2>
                {closeButton}
              </header>
              <div className="allergy-options">
                {allergenOptions.map((allergy) => (
                  <label key={allergy}>
                    <input
                      type="checkbox"
                      checked={allergyDraft.includes(allergy)}
                      onChange={() =>
                        setAllergyDraft((previous) =>
                          previous.includes(allergy) ? previous.filter((item) => item !== allergy) : [...previous, allergy],
                        )
                      }
                    />
                    {allergy}
                  </label>
                ))}
              </div>
              <label>
                직접 추가
                <input name="customAllergies" placeholder="예: 토마토, 키위" />
              </label>
              <button className="primary" type="submit" disabled={saving}>
                저장
              </button>
            </form>
          ) : null}

          {activeModal === "preferences" ? (
            <form onSubmit={submitPreferences}>
              <header>
                <h2>음식 선호도</h2>
                {closeButton}
              </header>
              <label>
                선호 음식
                <input name="preferredFoods" defaultValue={userFacingPreferences(activeDashboard.profile.preferredFoods).join(", ")} autoFocus />
              </label>
              <label>
                비선호 음식
                <input name="dislikedFoods" defaultValue={activeDashboard.profile.dislikedFoods.join(", ")} />
              </label>
              <button className="primary" type="submit" disabled={saving}>
                저장
              </button>
            </form>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <main className="phone-shell" data-active-screen={activeScreen} data-record-mode={recordMode} aria-label="예산 기반 다이어트 앱">
      <div className="status-bar" aria-hidden="true">
        <span>{currentTimeLabel}</span>
        <span className="signal">▮▮▮ 4G ▱</span>
      </div>

      <section className={`screen ${activeScreen === "home" ? "active" : ""}`} id="home-screen" data-screen="home">
        <header className="dashboard-hero">
          <div className="dashboard-topbar">
            <button className="dashboard-back" type="button" aria-label="회복 화면으로 이동" onClick={() => openScreen("recover")}>
              ‹
            </button>
            <button className="month-select dashboard-date" type="button" onClick={() => openScreen("calendar")}>
              {monthDay} 오늘 <span aria-hidden="true">⌄</span>
            </button>
            <button className="icon-button settings-button" type="button" aria-label="설정" onClick={() => openScreen("my")}>
              <span className="icon gear light" />
            </button>
          </div>

          <div className="dashboard-report-title">
            <span>{dashboard.profile.displayName}님의 오늘 기준</span>
            <h1>식비와 식단 리포트</h1>
          </div>

          <div className="dashboard-week" aria-label="이번 주">
            {dashboardWeek.map((day) => (
              <button className={day.selected ? "active" : ""} key={day.isoDate} type="button" onClick={() => openDietDate(day.isoDate)}>
                <span>{day.label}</span>
                <strong>{day.day}</strong>
              </button>
            ))}
          </div>
        </header>

        <div className="dashboard-content home-sheet">
          <HomePriorityAction
            dashboard={dashboard}
            onRecordMeal={openDietRecordSheet}
            onViewMealHistory={openTodayMealHistory}
            onViewRecommendation={() => openScreen("recommend")}
            onRecordWeight={() => openRecord("weight")}
          />

          <HomeOverviewCards
            dashboard={dashboard}
            calorieProgress={calorieProgress}
            budgetProgress={budgetProgress}
            onOpenDiet={openDietRecordSheet}
            onOpenWeight={() => openRecord("weight")}
            onOpenBudget={() => openRecord("budget")}
            onOpenRecommendation={() => openScreen("recommend")}
          />

          <WeeklyPlanTicker dashboard={dashboard} />

          <HomeRecommendationPreviewCard
            dashboard={dashboard}
            recommendation={dashboard.recommendations[0]}
            onOpenMealHistory={openTodayMealHistory}
            onOpenRecommendation={() => openScreen("recommend")}
          />
        </div>
      </section>

      <section className={`screen ${activeScreen === "calendar" ? "active" : ""}`} id="calendar-screen" data-screen="calendar">
        <CalendarThemeScreen
          summary={calendarSummary}
          onBack={() => openScreen("home")}
        />
      </section>

      <section className={`screen ${activeScreen === "recommend" ? "active" : ""}`} id="recommend-screen" data-screen="recommend">
        <header className="recommendation-hero">
          <button type="button" aria-label="홈으로" onClick={() => openScreen("home")}>
            ‹
          </button>
          <div>
            <span>식단 추천</span>
            <h1>지금 예산에 맞는 식사</h1>
          </div>
        </header>

        <RecommendationBudgetPanel
          mealType={recommendationMealType}
          budgetDraft={recommendationMealBudgetDraft}
          appliedBudgetKrw={activeRecommendationBudgetKrw}
          remainingBudgetKrw={dashboard.today.remainingBudgetKrw}
          remainingCaloriesKcal={dashboard.today.remainingCaloriesKcal}
          loading={recommendationLoading}
          onMealTypeChange={changeRecommendationMealType}
          onBudgetChange={setRecommendationMealBudgetDraft}
          onSubmit={requestBudgetRecommendations}
        />

        <div className="recommendation-tabs" role="tablist" aria-label="추천 기준">
          {recommendationTabOptions.map((tab) => (
            <button
              aria-label={`${tab.label} 추천 기준`}
              aria-selected={recommendationTab === tab.id}
              className={recommendationTab === tab.id ? "active" : ""}
              key={tab.id}
              role="tab"
              type="button"
              onClick={() => changeRecommendationTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {recommendationCalorieWarning ? (
          <p className="recommendation-calorie-warning" role="alert">
            {recommendationCalorieWarning}
          </p>
        ) : null}
        {notice ? <p className="inline-message recommendation-inline-message">{notice}</p> : null}

        <RecommendationChoicePanel
          items={availableRecommendationViewModels}
          selectedId={selectedRecommendationId}
          dashboard={dashboard}
          loading={recommendationLoading}
          hasRequested={Boolean(submittedRecommendationRequest)}
          panelRef={recommendationPanelRef}
          onSelect={selectRecommendationCandidate}
          onRecord={(recommendation) => requestRecommendationRecord(recommendation, { openRecordAfter: false })}
          onFeedback={feedbackRecommendation}
          feedbackById={recommendationFeedback}
          recordedIds={recordedRecommendationIds}
          skippedIds={skippedTodayRecommendationIds}
          motion={recommendationMotion}
          aiExplanation={selectedRecommendationId === null ? undefined : recommendationAiExplanations[selectedRecommendationId]}
          aiExplanationLoading={selectedRecommendationId !== null && recommendationAiLoadingIds.has(selectedRecommendationId)}
          onExplain={(recommendation) => void explainRecommendationWithAi(recommendation)}
        />

        <article className="recommendation-basis" aria-label="추천 기준">
          <div>
            <span>이번 주 남은 식비</span>
            <strong>{formatWon(dashboard.today.remainingBudgetKrw)}</strong>
          </div>
          <div>
            <span>오늘 남은 칼로리</span>
            <strong>{formatKcal(dashboard.today.remainingCaloriesKcal)}</strong>
          </div>
          <div>
            <span>목표</span>
            <strong>{goalLabel(dashboard.profile.goalType)}</strong>
          </div>
        </article>

        <article className="recommendation-filter-note" aria-label="개인화 필터">
          <span>알레르기 제외</span>
          <strong>{dashboard.profile.allergies.length ? dashboard.profile.allergies.join(", ") : "없음"}</strong>
          <span>선호 반영</span>
          <strong>{displayPreferredFoods.slice(0, 3).join(", ") || "미설정"}</strong>
        </article>

        <section className="recommendation-action-panel" aria-label="추천 추가 행동" data-aos="fade-up" data-aos-delay="90">
          <button
            className="recommendation-tool-trigger direct-search-trigger"
            type="button"
            aria-expanded={mealRecordSheetOpen}
            aria-controls="meal-record-sheet"
            onClick={() => {
              setRecordTab("search");
              setMealRecordSheetOpen(true);
              setShowAllRecommendations(false);
              setShowWeeklyPlan(false);
              setCatalogDrawerOpen(false);
            }}
          >
            <span aria-hidden="true">
              <FaIcon name="search" size={26} />
            </span>
            <div>
              <strong>음식 검색</strong>
              <em>바로 기록</em>
            </div>
          </button>
          <button
            className="recommendation-tool-trigger more-recommend-trigger"
            type="button"
            aria-expanded={showAllRecommendations}
            onClick={() => {
              setCatalogDrawerOpen(false);
              setShowWeeklyPlan(false);
              setShowAllRecommendations((current) => !current);
            }}
          >
            <span aria-hidden="true">
              <FaIcon name="random" size={26} />
            </span>
            <div>
              <strong>{showAllRecommendations ? "후보 접기" : "다른 추천"}</strong>
              <em>더보기</em>
            </div>
          </button>
          <button
            className="recommendation-tool-trigger weekly-plan-trigger"
            type="button"
            aria-expanded={showWeeklyPlan}
            onClick={() => {
              setCatalogDrawerOpen(false);
              setShowAllRecommendations(false);
              setShowWeeklyPlan((current) => !current);
            }}
          >
            <span aria-hidden="true">
              <FaIcon name="calendar-check-o" size={26} />
            </span>
            <div>
              <strong>{showWeeklyPlan ? "계획 접기" : "주간 계획"}</strong>
              <em>후보 관리</em>
            </div>
          </button>
        </section>

        {showAllRecommendations ? (
          <section className="recommendation-list-section" data-aos="fade-up" data-aos-delay="40">
            <header className="service-section-head">
              <div>
                <span>다른 선택지</span>
                <h2>전체 추천 후보</h2>
              </div>
            </header>
            {additionalRecommendationViewModels.length ? (
              <RecommendationList
                items={additionalRecommendationViewModels}
                onRecord={(recommendation) => requestRecommendationRecord(recommendation, { openRecordAfter: false })}
                onFeedback={feedbackRecommendation}
                feedbackById={recommendationFeedback}
                recordedIds={recordedRecommendationIds}
              />
            ) : (
              <article className="recommendation-decision-empty">
                <strong>추가 후보가 아직 없습니다</strong>
                <p>예산 맞춰 추천을 다시 누르면 새로운 후보 풀을 받아올 수 있어요.</p>
              </article>
            )}
          </section>
        ) : null}

        {showWeeklyPlan ? (
          <WeeklyPlanPanel
            plan={weeklyPlan}
            onGenerate={() => void regenerateWeeklyPlan()}
            onRecordMeal={requestWeeklyPlanMealRecord}
            onRefreshMeal={(meal) => void refreshWeeklyPlanMeal(meal)}
            refreshingMealIds={refreshingWeeklyMealIds}
            notice={weeklyPlanNotice}
          />
        ) : null}
      </section>

      <section className={`screen ${activeScreen === "recover" ? "active" : ""}`} id="recover-screen" data-screen="recover">
        <header className="recover-header">
          <button type="button" aria-label="홈으로" onClick={() => openScreen("home")}>
            ‹
          </button>
          <div>
            <span>회복 루틴</span>
            <h1>오늘 할 일을 가볍게 정리</h1>
          </div>
          <button className="icon-button" type="button" aria-label="설정" onClick={() => openScreen("my")}>
            <span className="icon gear dark" />
          </button>
        </header>

        <div className="recover-stack">
          <ShockRecoveryPanel revisions={recoveryPlans} onOpenCreate={() => setRecoveryPlanSheetOpen(true)} />

          <RecoveryTaskList completedPlans={completedPlans} tasks={recoverySummary?.tasks} onToggle={toggleRecoveryPlan} />

          <section className="recovery-baseline">
            <article>
              <span>남은 예산</span>
              <strong>{formatWon(recoverySummary?.remainingBudgetKrw ?? dashboard.today.remainingBudgetKrw)}</strong>
              <p>이번 주 사용 {formatWon(recoverySummary?.weeklySpentKrw ?? dashboard.weeklyMeals.spentMoneyKrw)}</p>
            </article>
            <article>
              <span>남은 칼로리</span>
              <strong>{formatKcal(recoverySummary?.remainingCaloriesKcal ?? dashboard.today.remainingCaloriesKcal)}</strong>
              <p>오늘 섭취 {formatKcal(recoverySummary?.todayCaloriesKcal ?? dashboard.today.caloriesKcal)}</p>
            </article>
          </section>

          <button className="recovery-recommend-link" type="button" onClick={openRecoveryRecommendations}>
            <span>회복 식단 추천받기</span>
            <b>추천 탭으로 이동</b>
          </button>
        </div>
      </section>

      <section className={`screen ${activeScreen === "my" ? "active" : ""}`} id="my-screen" data-screen="my">
        <header className="profile-hero">
          <div className="status-spacer" />
          <button className="icon-button settings-button profile-settings" type="button" aria-label="설정" onClick={() => openModal("profile")}>
            <span className="icon gear light" />
          </button>
          <div className="profile-row">
            <div className="avatar" aria-hidden="true">
              {dashboard.profile.displayName.slice(0, 1)}
            </div>
            <div>
              <h1>{dashboard.profile.displayName} 님</h1>
              <p>건강한 식습관 만들기 도전중!</p>
            </div>
            <button className="outline-pill" type="button" onClick={() => openModal("profile")}>
              프로필 편집 &gt;
            </button>
          </div>
        </header>

        <div className="rounded-sheet profile-sheet">
          <section className="profile-summary-grid" aria-label="마이페이지 요약">
            <article>
              <span>목표</span>
              <strong>{goalLabel(dashboard.profile.goalType)}</strong>
            </article>
            <article>
              <span>현재 체중</span>
              <strong>{dashboard.weight.currentWeightKg.toFixed(1)}kg</strong>
            </article>
            <article>
              <span>남은 식비</span>
              <strong>{formatWon(dashboard.today.remainingBudgetKrw)}</strong>
            </article>
          </section>

          <section className="profile-section" data-aos="fade-up" data-aos-delay="40">
            <header className="profile-section-head">
              <div>
                <span>목표 기준</span>
                <h2>식단 계산에 쓰는 값</h2>
              </div>
            </header>
            <article className="profile-goal-setting-card">
              <header>
                <div>
                  <span>체중 목표 설정</span>
                  <strong>{goalLabel(dashboard.profile.goalType)}</strong>
                </div>
                <button type="button" onClick={() => openModal("goal")}>
                  목표 체중 {dashboard.weight.targetWeightKg.toFixed(1)}kg
                </button>
              </header>
              <div className="profile-goal-segments" role="group" aria-label="목표 타입">
                {(["cut", "maintain", "bulk"] as GoalType[]).map((goalType) => (
                  <button
                    className={dashboard.profile.goalType === goalType ? "active" : ""}
                    disabled={saving}
                    key={goalType}
                    type="button"
                    onClick={() => void saveGoalType(goalType)}
                  >
                    {goalLabel(goalType)}
                  </button>
                ))}
              </div>
              <p>
                목표 변경 시 하루 목표 칼로리가 {goalLabel(dashboard.profile.goalType)} 기준으로 다시 계산됩니다.
              </p>
            </article>
            <div className="profile-action-grid">
              <button className="profile-action-card" type="button" onClick={() => openModal("goal")}>
                <span className="profile-action-icon" aria-hidden="true">
                  <FaIcon name="balance-scale" size={18} />
                </span>
                <strong>{goalLabel(dashboard.profile.goalType)}</strong>
                <small>유지 · 감량 · 증량 변경</small>
              </button>
              <button className="profile-action-card" type="button" onClick={() => openModal("calories")}>
                <span className="profile-action-icon" aria-hidden="true">
                  <FaIcon name="fire" size={18} />
                </span>
                <strong>{Math.round(dashboard.profile.targetCaloriesKcal)}kcal</strong>
                <small>BMR {Math.round(dashboard.profile.bmrKcal)}kcal</small>
              </button>
              <button className="profile-action-card" type="button" onClick={() => openModal("budget")}>
                <span className="profile-action-icon" aria-hidden="true">
                  <FaIcon name="money" size={18} />
                </span>
                <strong>{formatWon(dashboard.profile.weeklyBudgetKrw)}</strong>
                <small>하루 약 {formatWon(Math.round(dashboard.profile.weeklyBudgetKrw / 7))}</small>
              </button>
            </div>
          </section>

          <section className="profile-section" data-aos="fade-up" data-aos-delay="70">
            <header className="profile-section-head">
              <div>
                <span>프로필</span>
                <h2>신체 정보</h2>
              </div>
            </header>
            <article className="profile-row-list">
              <button type="button" onClick={() => openModal("body")}>
                <span className="profile-row-icon" aria-hidden="true">
                  <FaIcon name="user-circle-o" size={18} />
                </span>
                <span className="profile-row-copy">
                  <strong>신장 / 현재 체중</strong>
                  <small>체중 기록과 목표 계산에 사용</small>
                </span>
                <b>
                  {dashboard.profile.heightCm}cm · {dashboard.weight.currentWeightKg.toFixed(1)}kg
                </b>
                <i>&gt;</i>
              </button>
              <button type="button" onClick={() => openModal("sex")}>
                <span className="profile-row-icon" aria-hidden="true">
                  <FaIcon name="user-circle-o" size={18} />
                </span>
                <span className="profile-row-copy">
                  <strong>성별</strong>
                  <small>권장 칼로리 계산 기준</small>
                </span>
                <b>{dashboard.profile.sex === "female" ? "여자" : "남자"}</b>
                <i>&gt;</i>
              </button>
              <button type="button" onClick={() => openModal("age")}>
                <span className="profile-row-icon" aria-hidden="true">
                  <FaIcon name="calendar-o" size={18} />
                </span>
                <span className="profile-row-copy">
                  <strong>나이</strong>
                  <small>현재 계산 기준</small>
                </span>
                <b>{dashboard.profile.ageYearsSnapshot}세</b>
                <i>&gt;</i>
              </button>
            </article>
          </section>

          <section className="profile-section" data-aos="fade-up" data-aos-delay="100">
            <header className="profile-section-head">
              <div>
                <span>식단 기준</span>
                <h2>알레르기와 선호도</h2>
              </div>
            </header>
            <div className="profile-food-grid single">
              <article>
                <header>
                  <strong>알레르기</strong>
                  <button type="button" onClick={() => openModal("allergies")}>
                    수정
                  </button>
                </header>
                <p>{allergySummary}</p>
              </article>
            </div>
            <article className="profile-preference-panel">
              <header>
                <div>
                  <strong>음식 선호도</strong>
                  <span>추천 후보를 고를 때 참고해요.</span>
                </div>
                <button type="button" onClick={() => openModal("preferences")}>
                  수정
                </button>
              </header>
              <div className="preference-pill-groups">
                <div>
                  <span>선호</span>
                  <ul>
                    {displayPreferredFoods.length ? (
                      displayPreferredFoods.map((food) => (
                        <li key={food}>{food}</li>
                      ))
                    ) : (
                      <li className="muted">등록 없음</li>
                    )}
                  </ul>
                </div>
                <div>
                  <span>비선호</span>
                  <ul>
                    {displayDislikedFoods.length ? (
                      displayDislikedFoods.map((food) => (
                        <li key={food}>{food}</li>
                      ))
                    ) : (
                      <li className="muted">등록 없음</li>
                    )}
                  </ul>
                </div>
              </div>
            </article>
          </section>

          <section className="profile-section account-section" data-aos="fade-up" data-aos-delay="130">
            <header className="profile-section-head">
              <div>
                <span>계정</span>
                <h2>로그인 상태</h2>
              </div>
            </header>
            <article className="account-card">
              <div>
                <strong>{dashboard.profile.displayName}</strong>
                <span>{dashboard.profile.email ?? "아이디 로그인 계정"}</span>
              </div>
              <button className="logout-button" type="button" onClick={handleLogout}>
                <FaIcon name="sign-out" size={18} />
                <strong>로그아웃</strong>
              </button>
            </article>
          </section>
        </div>
      </section>

      <section className={`screen ${activeScreen === "record" ? "active" : ""}`} id="record-screen" data-screen="record">
        <header className="record-hero">
          <div className="record-topbar">
            <button type="button" aria-label="홈으로" onClick={() => openScreen("home")}>
              ‹
            </button>
            <strong>{recordMode === "diet" ? "식단 기록" : recordMode === "weight" ? "체중 기록" : "예산 입력"}</strong>
            <button type="button" aria-label="설정" onClick={() => openScreen("my")}>
              <span className="icon gear light" />
            </button>
          </div>
          <p>{recordMode === "diet" ? recordDateLabel : `${monthDay} 오늘`}</p>
          <div className="record-mode-switch" role="tablist" aria-label="기록 유형">
            <button
              aria-label="식단 기록 탭"
              aria-selected={recordMode === "diet"}
              className={recordMode === "diet" ? "active" : ""}
              role="tab"
              type="button"
              onClick={() => setRecordMode("diet")}
            >
              식단
            </button>
            <button
              aria-label="체중 기록 탭"
              aria-selected={recordMode === "weight"}
              className={recordMode === "weight" ? "active" : ""}
              role="tab"
              type="button"
              onClick={() => setRecordMode("weight")}
            >
              체중
            </button>
            <button
              aria-label="예산 기록 탭"
              aria-selected={recordMode === "budget"}
              className={recordMode === "budget" ? "active" : ""}
              role="tab"
              type="button"
              onClick={() => setRecordMode("budget")}
            >
              예산
            </button>
          </div>
        </header>

        {notice ? <p className="inline-message">{notice}</p> : null}

        <article className={`record-weight-card record-mode-section ${recordMode === "weight" ? "active" : ""}`}>
          <div className="record-card-head">
            <span>체중</span>
          </div>
          <form onSubmit={submitWeight}>
            <div className="weight-control">
              <button type="button" onClick={() => adjustWeight(-0.1)}>
                −
              </button>
              <strong>
                <input
                  name="weightKg"
                  type="number"
                  step="0.1"
                  value={currentWeightValue}
                  onChange={(event) => setWeightInput(event.target.value)}
                  aria-label="체중 kg"
                />
                <small>kg</small>
              </strong>
              <button type="button" onClick={() => adjustWeight(0.1)}>
                +
              </button>
            </div>
            <input type="hidden" name="measuredAt" value={`${todayDate}T08:00`} />
            <input type="hidden" name="note" value="아침 공복" />
            <p>목표 {dashboard.weight.targetWeightKg.toFixed(1)}kg</p>
            <div className="body-metric-inputs">
              <label>
                <span>체지방률</span>
                <input name="bodyFatPercent" type="number" inputMode="decimal" min="0" max="80" step="0.1" placeholder="선택" />
                <b>%</b>
              </label>
              <label>
                <span>골격근량</span>
                <input name="skeletalMuscleKg" type="number" inputMode="decimal" min="0" max="120" step="0.1" placeholder="선택" />
                <b>kg</b>
              </label>
            </div>
            <button className="primary" type="submit" style={{ width: "100%", marginTop: 16 }}>
              저장
            </button>
          </form>
        </article>

        <section className={`record-metrics record-mode-section ${recordMode === "diet" ? "active" : ""}`} aria-label="오늘 요약">
          <article className="metric-calorie">
            <span>섭취</span>
            <strong>{formatKcal(dashboard.today.caloriesKcal)}</strong>
          </article>
          <article className="metric-spend">
            <span>사용</span>
            <strong>{formatWon(dashboard.weeklyMeals.spentMoneyKrw)}</strong>
          </article>
          <article className="metric-budget">
            <span>잔액</span>
            <strong>{formatWon(dashboard.today.remainingBudgetKrw)}</strong>
          </article>
        </section>

        <section className={`record-chart record-mode-section ${recordMode === "weight" ? "active" : ""}`} aria-label="체중 변화 그래프">
          <SvgWeightChart points={recordWeightChartPoints} />
          {bodyMetricRecords.length ? (
            <div className="body-metric-strip" aria-label="체성분 기록">
              {bodyMetricRecords.map((record) => (
                <span key={record.id}>
                  <b>{shortDate(record.date)}</b> 체지방 {bodyMetricText(record.bodyFatPercent, "%")} · 골격근 {bodyMetricText(record.skeletalMuscleKg, "kg")}
                </span>
              ))}
            </div>
          ) : (
            <p className="body-metric-empty">체중 기록 저장 시 체지방률과 골격근량을 함께 남길 수 있어요.</p>
          )}
        </section>

        <section className={`budget-record-panel record-mode-section ${recordMode === "budget" ? "active" : ""}`}>
          <form className="budget-record-form" onSubmit={submitInlineBudget}>
            <header>
              <div>
                <span>이번 주 예산</span>
                <strong>{formatWon(normalizedBudgetDraft)}</strong>
              </div>
              <button type="submit" disabled={saving}>
                저장
              </button>
            </header>
            <label className="budget-amount-input">
              <span>예산 금액</span>
              <div>
                <input type="number" inputMode="numeric" min="0" step="1000" value={budgetDraft} onChange={(event) => setBudgetDraft(event.target.value)} aria-label="주간 예산" />
                <b>원</b>
              </div>
            </label>
            <input
              className="budget-range-input"
              type="range"
              min="30000"
              max="250000"
              step="5000"
              value={Math.min(250000, Math.max(30000, normalizedBudgetDraft))}
              onChange={(event) => setBudgetDraft(event.target.value)}
              aria-label="주간 예산 슬라이더"
            />
            <div className="budget-quick-grid" aria-label="빠른 예산 선택">
              {[50000, 75000, 100000, 150000].map((amount) => (
                <button className={normalizedBudgetDraft === amount ? "active" : ""} key={amount} type="button" onClick={() => setBudgetDraft(String(amount))}>
                  {formatWon(amount)}
                </button>
              ))}
            </div>
          </form>
          <article className="budget-helper">
            <strong>오늘 사용 가능 {formatWon(Math.round(dashboard.today.remainingBudgetKrw / 7))}</strong>
            <span>남은 기간 동안 예산을 나눠 쓸 수 있어요.</span>
            <span>
              이번 주 사용 {formatWon(dashboard.weeklyMeals.spentMoneyKrw)} · 잔액 {formatWon(dashboard.today.remainingBudgetKrw)}
            </span>
          </article>
        </section>

        <section className={`food-record-panel record-mode-section ${recordMode === "diet" ? "active" : ""}`}>
          <section className="food-add-cta-panel">
            <div>
              <span>빠른 추가</span>
              <h2>먹은 음식 기록하기</h2>
              <p>
                남은 {formatKcal(dashboard.today.remainingCaloriesKcal)} · 잔액 {formatWon(dashboard.today.remainingBudgetKrw)}
              </p>
            </div>
            <button
              type="button"
              aria-expanded={mealRecordSheetOpen}
              aria-controls="meal-record-sheet"
              onClick={() => {
                setCatalogDrawerOpen(false);
                setRecordTab(defaultRecordTab);
                setSearchQuery("");
                setMealRecordSheetOpen(true);
              }}
            >
              바로 기록
            </button>
          </section>

          <MealPeriodPanel
            dashboard={dashboard}
            summary={periodSummary ?? mealInsights?.period ?? null}
            period={mealPeriod}
            periodStart={periodStart}
            periodEnd={periodEnd}
            loading={periodLoading}
            hiddenMealIds={pendingMealIds}
            onPeriodChange={setMealPeriodPreset}
            onStartChange={(date) => {
              setMealPeriod("custom");
              setPeriodStart(date);
            }}
            onEndChange={(date) => {
              setMealPeriod("custom");
              setPeriodEnd(date);
            }}
            onDelete={removeMeal}
          />

          <RecoveryEventMiniList revisions={recoveryPlans} onOpenCreate={() => setRecoveryPlanSheetOpen(true)} onDelete={(revision) => void deleteRecoveryEvent(revision)} />
        </section>

        <section className={`section-block record-mode-section ${recordMode === "weight" ? "active" : ""}`}>
          <h2 className="section-title">체중 기록</h2>
          <div className="history-list">
            {weightRecordsForDisplay.length
              ? weightRecordsForDisplay.map((record) => (
                <article className="history-item" key={record.id}>
                  <div>
                    <span>{record.date}</span>
                    <strong>체중 기록</strong>
                    <small>
                      체지방 {bodyMetricText(record.bodyFatPercent, "%")} · 골격근 {bodyMetricText(record.skeletalMuscleKg, "kg")}
                    </small>
                  </div>
                  <p>{record.weightKg.toFixed(1)}kg</p>
                </article>
              ))
              : dashboard.weight.chart
                  .slice()
                  .reverse()
                  .map((record, index) => (
                    <article className="history-item" key={`${record.date}-${record.weightKg}-${index}`}>
                      <div>
                        <span>{record.date}</span>
                        <strong>체중 기록</strong>
                      </div>
                      <p>{record.weightKg.toFixed(1)}kg</p>
                    </article>
                  ))}
          </div>
        </section>
      </section>

      {renderModal()}

      <FoodSearchDrawer
        open={catalogDrawerOpen}
        foods={catalogFoods}
        loading={catalogFoodLoading}
        hasMore={catalogFoodHasMore}
        selectedMealType={selectedMealType}
        query={catalogSearchQuery}
        exactSearch={catalogExactSearch}
        favoriteFoodIds={effectiveFavoriteFoodIds}
        onClose={() => setCatalogDrawerOpen(false)}
        onQueryChange={setCatalogSearchQuery}
        onExactSearchChange={setCatalogExactSearch}
        onFavorite={favoriteFood}
        onRecord={recordFood}
      />

      <MealRecordSheet
        open={mealRecordSheetOpen}
        foods={recordFoods}
        loading={recordFoodLoading}
        hasMore={recordFoodHasMore}
        recordTab={recordTab}
        selectedMealType={selectedMealType}
        query={searchQuery}
        exactSearch={recordExactSearch}
        remainingCaloriesKcal={dashboard.today.remainingCaloriesKcal}
        remainingBudgetKrw={dashboard.today.remainingBudgetKrw}
        favoriteFoodIds={effectiveFavoriteFoodIds}
        onClose={() => setMealRecordSheetOpen(false)}
        onRecordTabChange={setRecordTab}
        onMealTypeChange={setSelectedMealType}
        onQueryChange={(nextQuery) => {
          setSearchQuery(nextQuery);
          if (nextQuery.trim()) setRecordTab("search");
        }}
        onExactSearchChange={setRecordExactSearch}
        onFavorite={favoriteFood}
        onRecord={recordFood}
        onManualRecord={recordManualMeal}
        onParseNaturalMeal={({ text, mealType }) => parseNaturalMeal({ text, mealType, consumedAt: consumedAtForMealType(mealType) })}
      />

      <RecoveryPlanSheet open={recoveryPlanSheetOpen} onClose={() => setRecoveryPlanSheetOpen(false)} onCreate={createRecoveryFromShock} />

      <RecommendationRecordSheet
        pending={pendingRecommendationRecord}
        onClose={() => setPendingRecommendationRecord(null)}
        onConfirm={(mealType) => void confirmRecommendationRecord(mealType)}
      />

      {latestPendingMeal ? (
        <div className="undo-toast" role="status" aria-live="polite">
          <div>
            <strong>{latestPendingMeal.food.name}</strong>
            <span>삭제 예정</span>
          </div>
          <button type="button" onClick={() => undoMealDeletion(latestPendingMeal)}>
            되돌리기
          </button>
        </div>
      ) : null}

      {mealAddedToast ? (
        <div className={`meal-added-toast ${latestPendingMeal ? "stacked" : ""}`} key={`meal-toast-${mealAddedToast.id}`} role="status" aria-live="polite">
          <span className="meal-added-toast-icon" aria-hidden="true">
            <FaIcon name="calendar-check-o" size={18} />
          </span>
          <div>
            <span>식단 추가 완료</span>
            <strong>{mealAddedToast.title}</strong>
            <em>{mealAddedToast.helper}</em>
          </div>
        </div>
      ) : null}

      {successAnimationCue ? (
        <div className={`success-lottie-burst ${successAnimationCue.tone}`} key={`success-burst-${successAnimationCue.id}`} aria-hidden="true">
          <Suspense fallback={<span className="success-lottie-fallback" />}>
            <SuccessLottie animationData={successCheckAnimation} loop={false} className="success-lottie-animation" />
          </Suspense>
        </div>
      ) : null}

      <RecommendationDrawLayer
        open={recommendationDrawOpen}
        items={availableRecommendationViewModels}
        selectedId={selectedRecommendationId}
        onClose={() => setRecommendationDrawOpen(false)}
        onSelect={selectRecommendationCandidate}
        onRecord={(recommendation) => requestRecommendationRecord(recommendation, { openRecordAfter: false })}
        onFeedback={feedbackRecommendation}
        feedbackById={recommendationFeedback}
        recordedIds={recordedRecommendationIds}
        skippedIds={skippedTodayRecommendationIds}
        motion={recommendationMotion}
      />

      <QuickRecordSheet open={quickAddOpen} onClose={() => setQuickAddOpen(false)} onAction={handleQuickAction} />

      <nav className="bottom-nav" aria-label="하단 메뉴">
        <button aria-label="홈 화면으로 이동" className={activeScreen === "home" ? "active" : ""} type="button" onClick={() => openScreen("home")}>
          <FaIcon name="home" className="nav-icon" size={24} />
          <strong>홈</strong>
        </button>
        <button
          aria-label="추천 화면으로 이동"
          className={activeScreen === "recommend" ? "active" : ""}
          type="button"
          onClick={() => openScreen("recommend")}
        >
          <FaIcon name="magic" className="nav-icon" size={24} />
          <strong>추천</strong>
        </button>
        <button
          className={activeScreen === "record" || quickAddOpen ? "active" : ""}
          type="button"
          aria-label="기록 항목 선택 열기"
          aria-haspopup="dialog"
          aria-expanded={quickAddOpen}
          aria-controls="quick-record-sheet"
          onClick={() => setQuickAddOpen((current) => !current)}
        >
          <FaIcon name="cutlery" className="nav-icon" size={24} />
          <strong>기록</strong>
        </button>
        <button
          aria-label="회복 화면으로 이동"
          className={activeScreen === "recover" ? "active" : ""}
          type="button"
          onClick={() => openScreen("recover")}
        >
          <FaIcon name="refresh" className="nav-icon" size={24} />
          <strong>회복</strong>
        </button>
        <button aria-label="마이페이지로 이동" className={activeScreen === "my" ? "active" : ""} type="button" onClick={() => openScreen("my")}>
          <FaIcon name="user-circle-o" className="nav-icon" size={24} />
          <strong>마이</strong>
        </button>
      </nav>
    </main>
  );
}
