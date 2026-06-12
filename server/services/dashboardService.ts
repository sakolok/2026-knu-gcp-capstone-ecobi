import { getProfile } from "../repositories/profileRepository.js";
import { getWeightChart, getWeightSummary } from "../repositories/weightRepository.js";
import { getPeriodMealSummary, listMealLogs, summarizeMeals } from "../repositories/mealRepository.js";
import { getWeekRange, todayISO } from "../utils/date.js";
import type { DashboardSummary } from "../types/domain.js";

export async function getDashboardSummary(userId: number): Promise<DashboardSummary | null> {
  const profile = await getProfile(userId);
  if (!profile) return null;

  const today = todayISO();
  const week = getWeekRange(today);
  const todayMeals = (await listMealLogs(userId, { date: today })).reverse();
  const todaySummary = summarizeMeals(todayMeals);
  const weeklyMeals = await getPeriodMealSummary(userId, week.startDate, week.endDate);
  const weightSummary = await getWeightSummary(userId);

  return {
    profile,
    today: {
      ...todaySummary,
      remainingCaloriesKcal: Math.max(profile.targetCaloriesKcal - todaySummary.caloriesKcal, 0),
      remainingBudgetKrw: Math.max(profile.weeklyBudgetKrw - weeklyMeals.spentMoneyKrw, 0),
      meals: todayMeals,
    },
    weight: {
      ...weightSummary,
      chart: await getWeightChart(userId, { startDate: "2026-05-18", endDate: today }),
    },
    weeklyMeals,
    recommendations: [],
  };
}
