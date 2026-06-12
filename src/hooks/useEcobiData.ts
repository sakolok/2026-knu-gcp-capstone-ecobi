import { useCallback, useEffect, useState } from "react";
import type {
  CalendarSummary,
  DashboardSummary,
  MealInsights,
  PeriodMealSummary,
  Recommendation,
  RecommendationTabSummary,
  RecoverySummary,
  WeightDashboard,
} from "../types/domain";
import {
  getCalendarSummary,
  createRecommendationJob,
  getDashboard,
  getMealInsights,
  getRecommendationTabs,
  getRecoverySummary,
  getWeeklyMeals,
  getWeightDashboard,
  waitForRecommendationJob,
} from "../services/ecobiService";

type DataState = {
  dashboard: DashboardSummary | null;
  calendarSummary: CalendarSummary | null;
  weeklyMeals: PeriodMealSummary | null;
  mealInsights: MealInsights | null;
  weightDashboard: WeightDashboard | null;
  recoverySummary: RecoverySummary | null;
  recommendationTabs: RecommendationTabSummary[];
  recommendations: Recommendation[];
};

export function useEcobiData(enabled = true) {
  const [data, setData] = useState<DataState>({
    dashboard: null,
    calendarSummary: null,
    weeklyMeals: null,
    mealInsights: null,
    weightDashboard: null,
    recoverySummary: null,
    recommendationTabs: [],
    recommendations: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const dashboard = await getDashboard();
      const [calendarSummaryResult, weeklyMealsResult, mealInsightsResult, weightDashboardResult, recoverySummaryResult, recommendationTabsResult] =
        await Promise.allSettled([
          getCalendarSummary(),
          getWeeklyMeals(),
          getMealInsights(),
          getWeightDashboard({ rangeType: "week" }),
          getRecoverySummary(),
          getRecommendationTabs(),
        ]);
      const readResult = <T,>(result: PromiseSettledResult<T>, fallback: T, label: string) => {
        if (result.status === "fulfilled") return result.value;
        console.error(`[initial_data_load_error:${label}]`, result.reason);
        return fallback;
      };
      const calendarSummary = readResult(calendarSummaryResult, null, "calendar");
      const weeklyMeals = readResult(weeklyMealsResult, null, "weeklyMeals");
      const mealInsights = readResult(mealInsightsResult, null, "mealInsights");
      const weightDashboard = readResult(weightDashboardResult, null, "weightDashboard");
      const recoverySummary = readResult(recoverySummaryResult, null, "recoverySummary");
      const recommendationTabs = readResult(recommendationTabsResult, [], "recommendationTabs");
      setData((current) => ({
        ...current,
        dashboard,
        calendarSummary,
        weeklyMeals,
        mealInsights,
        weightDashboard,
        recoverySummary,
        recommendationTabs,
      }));

      void createRecommendationJob("dinner", { intent: "personal", limit: 3 })
        .then((job) => waitForRecommendationJob(job.runId, { timeoutMs: 180000 }))
        .then((job) => {
          const recommendations = job.recommendations;
          setData((current) => ({
            ...current,
            recommendations,
            dashboard: current.dashboard
              ? {
                  ...current.dashboard,
                  recommendations: recommendations.slice(0, 3),
                }
              : current.dashboard,
            recoverySummary: current.recoverySummary
              ? {
                  ...current.recoverySummary,
                  mealPreview: recommendations.slice(0, 2),
                }
              : current.recoverySummary,
          }));
        })
        .catch((recommendationError) => {
          console.error("[recommendation_load_error]", recommendationError);
        });
    } catch (err) {
      setError(err instanceof Error ? err.message : "데이터를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    ...data,
    loading,
    error,
    refresh,
  };
}
