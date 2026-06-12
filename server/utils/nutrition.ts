import type { GoalType, Sex } from "../types/domain.js";

const activityFactors = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  athlete: 1.9,
} as const;

const goalDeltas: Record<GoalType, number> = {
  maintain: 0,
  cut: -300,
  bulk: 250,
};

export function calculateBmr({
  sex,
  weightKg,
  heightCm,
  age,
}: {
  sex: Sex;
  weightKg: number;
  heightCm: number;
  age: number;
}) {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return Math.round(base + (sex === "male" ? 5 : -161));
}

export function calculateTargets(input: {
  sex: Sex;
  weightKg: number;
  heightCm: number;
  age: number;
  activityLevel: keyof typeof activityFactors;
  goalType: GoalType;
}) {
  const activityFactor = activityFactors[input.activityLevel];
  const bmrKcal = calculateBmr({
    sex: input.sex,
    weightKg: input.weightKg,
    heightCm: input.heightCm,
    age: input.age,
  });
  const tdeeKcal = Math.round(bmrKcal * activityFactor);
  const targetCalorieDeltaKcal = goalDeltas[input.goalType];
  const targetCaloriesKcal = Math.max(900, tdeeKcal + targetCalorieDeltaKcal);
  return {
    activityFactor,
    bmrKcal,
    tdeeKcal,
    targetCaloriesKcal,
    targetCalorieDeltaKcal,
  };
}

export function macroTargetsFromCalories(calorieTarget: number) {
  return {
    carbsG: Math.max(1, Math.round((calorieTarget * 0.5) / 4)),
    proteinG: Math.max(1, Math.round((calorieTarget * 0.25) / 4)),
    fatG: Math.max(1, Math.round((calorieTarget * 0.25) / 9)),
  };
}
