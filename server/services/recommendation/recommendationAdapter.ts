import type { MealChannel, MealLog, MealType, Recommendation, RecommendationIntent, UserProfile } from "../../types/domain.js";

export type RecommendationInput = {
  runId: number;
  userId?: number;
  mealType?: MealType;
  intent?: RecommendationIntent;
  mealChannel?: MealChannel;
  limit: number;
  remainingBudgetKrw?: number;
  remainingCaloriesKcal?: number;
  targetMealBudgetKrw?: number;
  targetMealCaloriesKcal?: number;
  preferredChannels?: MealChannel[];
  profile?: UserProfile;
  constraints?: {
    allergies: string[];
    preferredFoods: string[];
    dislikedFoods: string[];
  };
  recentMeals?: MealLog[];
};

export type RecommendationAdapterResult = {
  recommendations: Recommendation[];
  persistedCandidates?: boolean;
};

export type RecommendationAdapter = {
  recommend(input: RecommendationInput): Promise<RecommendationAdapterResult>;
};
