import { z } from "zod";
import { goalTypeSchema } from "./commonSchemas.js";

const textListSchema = z.array(z.string().trim().min(1).max(80)).max(30);

export const updateGoalSchema = z.object({
  goalType: goalTypeSchema,
  targetWeightKg: z.coerce.number().positive().max(300),
  targetCaloriesKcal: z.coerce.number().positive().max(6000),
  targetCalorieDeltaKcal: z.coerce.number().int().min(-1000).max(1000),
  weeklyBudgetKrw: z.coerce.number().int().positive().max(5000000),
});

export const updateProfileSchema = z.object({
  displayName: z.string().trim().min(1).max(50),
  email: z.union([z.string().trim().email(), z.literal(""), z.null()]).optional(),
});

export const updateBudgetSchema = z.object({
  weeklyBudgetKrw: z.coerce.number().int().positive().max(5000000),
});

export const updateCaloriesSchema = z.object({
  targetCaloriesKcal: z.coerce.number().positive().max(6000),
});

export const updateBodySchema = z.object({
  heightCm: z.coerce.number().positive().max(260),
  weightKg: z.coerce.number().positive().max(300).optional(),
});

export const updateDemographicsSchema = z.object({
  sex: z.enum(["male", "female"]).optional(),
  ageYearsSnapshot: z.coerce.number().int().positive().max(120).optional(),
});

export const updateAllergiesSchema = z.object({
  allergies: textListSchema,
});

export const updatePreferencesSchema = z.object({
  preferredFoods: textListSchema,
  dislikedFoods: textListSchema,
});

export const toggleFoodFavoriteSchema = z.object({
  foodId: z.coerce.number().int().positive(),
});

export const createUserInteractionSchema = z.object({
  foodId: z.coerce.number().int().positive().optional(),
  candidateId: z.coerce.number().int().positive().optional(),
  interactionType: z.enum(["impressed", "clicked", "accepted", "rejected", "skipped", "logged", "corrected", "deleted"]),
  interactionWeight: z.coerce.number().min(-5).max(5).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
