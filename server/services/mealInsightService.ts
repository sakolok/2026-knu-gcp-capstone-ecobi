import type { MealChannel, MealInsights, MealType } from "../types/domain.js";
import { getPeriodMealSummary, listMealLogs } from "../repositories/mealRepository.js";
import { getWeekRange, todayISO } from "../utils/date.js";

function countBy<T extends string>(items: T[]) {
  return items.reduce<Record<string, number>>((acc, item) => {
    acc[item] = (acc[item] ?? 0) + 1;
    return acc;
  }, {});
}

export async function getMealInsights(userId: number, startDate: string, endDate: string): Promise<MealInsights> {
  const period = await getPeriodMealSummary(userId, startDate, endDate);
  const week = getWeekRange(todayISO());
  const weekly = await getPeriodMealSummary(userId, week.startDate, week.endDate);
  const todayMeals = await listMealLogs(userId, { date: todayISO() });
  const recentMeals = await listMealLogs(userId, { limit: 8 });
  const periodMeals = period.byDate.flatMap((day) => day.meals);

  const mealTypeCounts = countBy(periodMeals.map((meal) => meal.mealType));
  const channelBuckets = periodMeals.reduce<Record<string, { count: number; spentMoneyKrw: number }>>((acc, meal) => {
    const key = meal.food.mealChannel;
    acc[key] = acc[key] ?? { count: 0, spentMoneyKrw: 0 };
    acc[key].count += 1;
    acc[key].spentMoneyKrw += meal.spentMoneyKrw;
    return acc;
  }, {});

  const highestCalorieDay = period.byDate
    .filter((day) => day.summary.mealCount > 0)
    .map((day) => ({ date: day.date, caloriesKcal: day.summary.caloriesKcal }))
    .sort((a, b) => b.caloriesKcal - a.caloriesKcal)[0] ?? null;
  const highestSpendDay = period.byDate
    .filter((day) => day.summary.mealCount > 0)
    .map((day) => ({ date: day.date, spentMoneyKrw: day.summary.spentMoneyKrw }))
    .sort((a, b) => b.spentMoneyKrw - a.spentMoneyKrw)[0] ?? null;

  return {
    period,
    recentMeals,
    todayMeals,
    weekly,
    patterns: {
      highestCalorieDay,
      highestSpendDay,
      mealTypeDistribution: Object.entries(mealTypeCounts).map(([mealType, count]) => ({ mealType: mealType as MealType, count })),
      channelDistribution: Object.entries(channelBuckets).map(([mealChannel, value]) => ({
        mealChannel: mealChannel as MealChannel,
        count: value.count,
        spentMoneyKrw: value.spentMoneyKrw,
      })),
    },
  };
}
