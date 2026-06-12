import { describe, expect, it } from "vitest";
import { calculateTargets } from "../server/utils/nutrition.js";

describe("nutrition target calculation", () => {
  it("uses Mifflin-St Jeor and goal delta", () => {
    const result = calculateTargets({
      sex: "female",
      weightKg: 56.4,
      heightCm: 162,
      age: 24,
      activityLevel: "light",
      goalType: "cut",
    });

    expect(result.bmrKcal).toBe(1296);
    expect(result.tdeeKcal).toBe(1782);
    expect(result.targetCaloriesKcal).toBe(1482);
    expect(result.targetCalorieDeltaKcal).toBe(-300);
  });
});
