export type GoalType = "maintain" | "cut" | "bulk";
export type MealType = "breakfast" | "lunch" | "dinner" | "snack";
export type MealChannel = "convenience_store" | "cafeteria" | "home_meal" | "delivery";

export type UserProfile = {
  userId: number;
  email: string | null;
  displayName: string;
  goalType: GoalType;
  sex: "male" | "female";
  ageYearsSnapshot: number;
  heightCm: number;
  currentWeightKg: number;
  targetWeightKg: number;
  activityLevel: string;
  activityFactor: number;
  energyTargetSource: "calculated" | "manual";
  bmrKcal: number;
  tdeeKcal: number;
  targetCaloriesKcal: number;
  targetCalorieDeltaKcal: number;
  weeklyBudgetKrw: number;
  availableMealChannels: MealChannel[];
  allergies: string[];
  preferredFoods: string[];
  dislikedFoods: string[];
  favoriteFoodIds: number[];
};

export type WeightRecord = {
  id: number;
  measuredAt: string;
  date: string;
  weightKg: number;
  heightCm: number | null;
  bodyFatPercent: number | null;
  skeletalMuscleKg: number | null;
  source: string;
  note: string | null;
};

export type WeightSummary = {
  currentWeightKg: number;
  targetWeightKg: number;
  startWeightKg: number;
  previousWeightKg: number | null;
  changeFromPreviousKg: number | null;
  changeFromStartKg: number;
  progressRate: number;
  latestRecordedAt: string | null;
};

export type Food = {
  id: number;
  name: string;
  unitType: string;
  mealChannel: MealChannel;
  category: string | null;
  priceKrw: number;
  caloriesKcal: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
  tags: string[];
  allergens: string[];
};

export type FoodSearchResult = {
  items: Food[];
  limit: number;
  offset: number;
  hasMore: boolean;
  query: string | null;
  mealChannel: MealChannel | null;
};

export type MealLog = {
  id: number;
  userFoodEntryId: number | null;
  date: string;
  consumedAt: string;
  mealType: MealType;
  food: Food;
  quantityLabel: string;
  quantityG: number | null;
  spentMoneyKrw: number;
  caloriesKcal: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
  sourceType: "manual" | "manual_custom" | "recommendation";
};

export type NutritionSummary = {
  caloriesKcal: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
  spentMoneyKrw: number;
  mealCount: number;
};

export type PeriodMealSummary = NutritionSummary & {
  startDate: string;
  endDate: string;
  byDate: Array<{
    date: string;
    summary: NutritionSummary;
    meals: MealLog[];
  }>;
  pattern: {
    mostFrequentMealType: MealType | null;
    averageCaloriesPerDay: number;
    averageSpendPerDay: number;
  };
};

export type Recommendation = {
  id: number;
  name: string;
  mealType: MealType;
  mealChannel: MealChannel;
  totalPriceKrw: number;
  totalCaloriesKcal: number;
  totalProteinG: number;
  totalFatG: number;
  totalCarbsG: number;
  reason: string;
  goalFit: string;
  score: number;
  tags: string[];
  allergenWarnings?: string[];
  preferenceMatches?: string[];
  scoreBreakdown?: string[];
  items: Array<{
    foodId: number;
    foodName: string;
    quantityLabel: string;
    priceKrw: number;
    caloriesKcal: number;
    proteinG: number;
  }>;
};

export type RecommendationIntent = "personal" | "recovery" | "protein" | "budget";

export type RecommendationTabSummary = {
  id: RecommendationIntent;
  label: string;
  description: string;
};

export type RecommendationJobStatus = "queued" | "running" | "completed" | "failed";

export type RecommendationJob = {
  runId: number;
  userId: number;
  status: RecommendationJobStatus;
  mealType: MealType;
  requestedLimit: number;
  dispatcher: string | null;
  requestedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
  candidateCount: number;
  recommendations: Recommendation[];
};

export type MealInsights = {
  period: PeriodMealSummary;
  recentMeals: MealLog[];
  todayMeals: MealLog[];
  weekly: PeriodMealSummary;
  patterns: {
    highestCalorieDay: { date: string; caloriesKcal: number } | null;
    highestSpendDay: { date: string; spentMoneyKrw: number } | null;
    mealTypeDistribution: Array<{ mealType: MealType; count: number }>;
    channelDistribution: Array<{ mealChannel: MealChannel; count: number; spentMoneyKrw: number }>;
  };
};

export type WeightDashboard = {
  summary: WeightSummary;
  range: {
    startDate: string;
    endDate: string;
    rangeType: "week" | "month" | "custom";
  };
  records: WeightRecord[];
  chart: Array<{ date: string; weightKg: number }>;
  trend: {
    recordCount: number;
    latestRecordedAt: string | null;
    averageChangeKg: number | null;
    direction: "up" | "down" | "flat" | "none";
  };
};

export type RecoverySummary = {
  remainingBudgetKrw: number;
  remainingCaloriesKcal: number;
  weeklySpentKrw: number;
  todayCaloriesKcal: number;
  riskLevel: "low" | "medium" | "high";
  tasks: Array<{
    id: string;
    title: string;
    helper: string;
    targetType: "budget" | "protein" | "calories" | "habit";
    completed: boolean;
  }>;
  mealPreview: Recommendation[];
};

export type DashboardSummary = {
  profile: UserProfile;
  today: NutritionSummary & {
    remainingCaloriesKcal: number;
    remainingBudgetKrw: number;
    meals: MealLog[];
  };
  weight: WeightSummary & {
    chart: Array<{ date: string; weightKg: number }>;
  };
  weeklyMeals: PeriodMealSummary;
  recommendations: Recommendation[];
};

export type ExerciseLog = {
  id: number;
  date: string;
  performedAt: string;
  name: string;
  durationMinutes: number;
  caloriesBurnedKcal: number | null;
};

export type CalendarDaySummary = {
  date: string;
  dayLabel: string;
  dayOfMonth: number;
  meals: Array<{
    id: number;
    mealType: MealType;
    consumedAt: string;
    caloriesKcal: number;
  }>;
  exercises: ExerciseLog[];
  nutrition: NutritionSummary;
  weight: {
    weightKg: number | null;
    bodyFatPercent: number | null;
    skeletalMuscleKg: number | null;
  };
};

export type CalendarSummary = {
  startDate: string;
  endDate: string;
  days: CalendarDaySummary[];
};

export type WeeklyPlanMeal = {
  id: number;
  dayIndex: number;
  date: string;
  mealType: MealType;
  candidate: Recommendation | null;
  plannedPriceKrw: number;
  plannedCaloriesKcal: number;
  plannedProteinG: number;
};

export type WeeklyPlanSummary = {
  id: number;
  startDate: string;
  endDate: string;
  weeklyBudgetKrw: number;
  targetCaloriesKcal: number;
  status: "active" | "superseded" | "archived";
  meals: WeeklyPlanMeal[];
  totals: {
    plannedPriceKrw: number;
    plannedCaloriesKcal: number;
    plannedProteinG: number;
  };
};

export type ShockEventType = "company_dinner" | "delivery" | "eating_out" | "other";

export type RecoveryPlanRevision = {
  id: number;
  shockEventId: number;
  eventType: ShockEventType;
  eventLabel: string;
  expectedSpendKrw: number;
  eventDate: string;
  eventDayIndex: number;
  note: string | null;
  revisionStatus: "feasible" | "infeasible" | "accepted" | "rejected";
  blockedConstraint: "budget" | "protein" | "channel" | "calories" | null;
  createdAt: string;
  suggestions: Array<{
    id: number;
    dayIndex: number;
    mealType: MealType;
    action: "replace" | "remove" | "add";
    candidate: Recommendation | null;
    revisedPriceKrw: number | null;
    revisedCaloriesKcal: number | null;
    revisedProteinG: number | null;
  }>;
};
