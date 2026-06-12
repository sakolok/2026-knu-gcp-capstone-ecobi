import { describe, expect, it } from "vitest";
import { onboardingSchema } from "../server/validators/authSchemas.js";

const validOnboardingInput = {
  displayName: "민아",
  birthDate: "1998-06-03",
  sex: "female",
  heightCm: 162,
  weightKg: 55,
  targetWeightKg: 52,
  goalType: "cut",
  activityLevel: "light",
  dietType: "균형 건강식",
  mealTimes: {
    breakfast: "08:00",
    lunch: "12:00",
    dinner: "18:00",
  },
  allergies: ["없음"],
  dislikedFoods: [],
  weeklyBudgetKrw: 75000,
  availableMealChannels: ["home_meal"],
};

describe("auth onboarding validation", () => {
  it("rejects future birth dates", () => {
    const nextYear = new Date().getFullYear() + 1;
    const result = onboardingSchema.safeParse({
      ...validOnboardingInput,
      birthDate: `${nextYear}-01-01`,
    });

    expect(result.success).toBe(false);
  });

  it("rejects impossible calendar dates", () => {
    const result = onboardingSchema.safeParse({
      ...validOnboardingInput,
      birthDate: "2026-02-31",
    });

    expect(result.success).toBe(false);
  });
});
