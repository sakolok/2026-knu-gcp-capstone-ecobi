import type { CalendarSummary } from "../types/domain.js";
import { enumerateDates, getWeekRange } from "../utils/date.js";
import { listMealLogs, summarizeMeals } from "./mealRepository.js";
import { listWeightRecords } from "./weightRepository.js";

const dayLabels = ["일", "월", "화", "수", "목", "금", "토"];

export async function getCalendarSummary(userId: number, referenceDate: string): Promise<CalendarSummary> {
  const week = getWeekRange(referenceDate);
  const dates = enumerateDates(week.startDate, week.endDate);
  const [meals, weights] = await Promise.all([
    listMealLogs(userId, { startDate: week.startDate, endDate: week.endDate }),
    listWeightRecords(userId, { startDate: week.startDate, endDate: week.endDate }),
  ]);

  return {
    startDate: week.startDate,
    endDate: week.endDate,
    days: dates.map((date) => {
      const dayMeals = meals.filter((meal) => meal.date === date).reverse();
      const dayWeight = weights.find((weight) => weight.date === date);
      const jsDate = new Date(`${date}T00:00:00`);

      return {
        date,
        dayLabel: dayLabels[jsDate.getDay()],
        dayOfMonth: jsDate.getDate(),
        meals: dayMeals.map((meal) => ({
          id: meal.id,
          mealType: meal.mealType,
          consumedAt: meal.consumedAt,
          caloriesKcal: meal.caloriesKcal,
        })),
        exercises: [],
        nutrition: summarizeMeals(dayMeals),
        weight: {
          weightKg: dayWeight?.weightKg ?? null,
          bodyFatPercent: dayWeight?.bodyFatPercent ?? null,
          skeletalMuscleKg: dayWeight?.skeletalMuscleKg ?? null,
        },
      };
    }),
  };
}
