import type { RecoverySummary } from "../types/domain.js";
import { getPeriodMealSummary } from "../repositories/mealRepository.js";
import { getProfile } from "../repositories/profileRepository.js";
import { getWeekRange, todayISO } from "../utils/date.js";

export async function getRecoverySummary(userId: number): Promise<RecoverySummary | null> {
  const profile = await getProfile(userId);
  if (!profile) return null;

  const week = getWeekRange(todayISO());
  const weekly = await getPeriodMealSummary(userId, week.startDate, week.endDate);
  const today = await getPeriodMealSummary(userId, todayISO(), todayISO());
  const remainingBudgetKrw = Math.max(profile.weeklyBudgetKrw - weekly.spentMoneyKrw, 0);
  const remainingCaloriesKcal = Math.max(profile.targetCaloriesKcal - today.caloriesKcal, 0);
  const budgetUsedRate = weekly.spentMoneyKrw / profile.weeklyBudgetKrw;
  const riskLevel = budgetUsedRate > 0.85 || remainingCaloriesKcal < 250 ? "high" : budgetUsedRate > 0.65 ? "medium" : "low";

  return {
    remainingBudgetKrw,
    remainingCaloriesKcal,
    weeklySpentKrw: weekly.spentMoneyKrw,
    todayCaloriesKcal: today.caloriesKcal,
    riskLevel,
    tasks: [
      {
        id: "budget-dinner",
        title: "다음 식사는 남은 예산 안에서 고르기",
        helper: `이번 주 남은 식비 ${remainingBudgetKrw.toLocaleString("ko-KR")}원`,
        targetType: "budget",
        completed: false,
      },
      {
        id: "protein-balance",
        title: "단백질 중심으로 한 끼 보완하기",
        helper: `오늘 단백질 ${today.proteinG}g 기록`,
        targetType: "protein",
        completed: false,
      },
      {
        id: "calorie-balance",
        title: "남은 칼로리 안에서 가볍게 마무리",
        helper: `남은 칼로리 ${remainingCaloriesKcal.toLocaleString("ko-KR")}kcal`,
        targetType: "calories",
        completed: false,
      },
    ],
    mealPreview: [],
  };
}
