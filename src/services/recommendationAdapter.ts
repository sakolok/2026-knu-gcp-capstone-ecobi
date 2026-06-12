import type { DashboardSummary, Recommendation, RecommendationIntent } from "../types/domain";
import { formatKcal, formatWon, goalLabel, mealTypeLabel } from "../utils/format";

export type RecommendationTab = RecommendationIntent;

export const recommendationTabs: Array<{ id: RecommendationTab; label: string }> = [
  { id: "personal", label: "맞춤 추천" },
  { id: "recovery", label: "회복 식단" },
  { id: "protein", label: "고단백" },
  { id: "budget", label: "예산 절약" },
];

export type RecommendationViewModel = {
  id: number;
  source: Recommendation;
  title: string;
  subtitle: string;
  reason: string;
  goalFit: string;
  meta: string;
  nutrition: Array<{ label: string; value: string }>;
  tags: string[];
};

export function getVisibleRecommendationChoiceItems<T extends { id: number }>(items: T[], selectedId: number | null, limit = 3): T[] {
  if (!items.length || limit <= 0) return [];
  const selected = selectedId === null ? null : items.find((item) => item.id === selectedId) ?? null;
  if (!selected) return items.slice(0, limit);
  return [selected, ...items.filter((item) => item.id !== selected.id).slice(0, Math.max(0, limit - 1))];
}

export function getAdditionalRecommendationItems<T extends { id: number }>(items: T[], selectedId: number | null, limit = 3): T[] {
  const visibleIds = new Set(getVisibleRecommendationChoiceItems(items, selectedId, limit).map((item) => item.id));
  return items.filter((item) => !visibleIds.has(item.id));
}

const tabReason: Record<RecommendationTab, string> = {
  personal: "최근 식단, 목표 칼로리, 남은 식비를 함께 고려한 추천입니다.",
  recovery: "오늘 남은 칼로리 안에서 부담을 줄이고 단백질을 보완하는 구성입니다.",
  protein: "단백질 비중이 높은 메뉴를 우선해 포만감과 근손실 방지를 돕습니다.",
  budget: "이번 주 남은 식비 안에서 가격 대비 영양 구성이 좋은 메뉴입니다.",
};

function scoreByTab(recommendation: Recommendation, tab: RecommendationTab, dashboard: DashboardSummary) {
  if (tab === "protein") return recommendation.totalProteinG;
  if (tab === "budget") return Math.max(0, dashboard.today.remainingBudgetKrw - recommendation.totalPriceKrw);
  if (tab === "recovery") {
    const calorieFit = Math.abs(dashboard.today.remainingCaloriesKcal - recommendation.totalCaloriesKcal);
    return recommendation.totalProteinG * 20 - calorieFit;
  }
  return recommendation.score;
}

export function buildRecommendationViewModels(
  recommendations: Recommendation[],
  tab: RecommendationTab,
  dashboard: DashboardSummary,
): RecommendationViewModel[] {
  return recommendations
    .slice()
    .sort((a, b) => scoreByTab(b, tab, dashboard) - scoreByTab(a, tab, dashboard))
    .map((recommendation) => ({
      id: recommendation.id,
      source: recommendation,
      title: recommendation.name,
      subtitle: mealTypeLabel(recommendation.mealType),
      reason: recommendation.reason || tabReason[tab],
      goalFit:
        recommendation.goalFit ||
        `${goalLabel(dashboard.profile.goalType)} 목표 기준 ${formatKcal(recommendation.totalCaloriesKcal)} 구성`,
      meta: `${formatWon(recommendation.totalPriceKrw)} · ${formatKcal(recommendation.totalCaloriesKcal)}`,
      nutrition: [
        { label: "단백질", value: `${recommendation.totalProteinG}g` },
        { label: "탄수", value: `${recommendation.totalCarbsG}g` },
        { label: "지방", value: `${recommendation.totalFatG}g` },
      ],
      tags: recommendation.tags.slice(0, 4),
    }));
}
