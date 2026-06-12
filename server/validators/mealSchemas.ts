import { z } from "zod";
import { isoDateTimeSchema, mealTypeSchema } from "./commonSchemas.js";

export const createMealSchema = z
  .object({
    foodId: z.number().int().positive().optional(),
    foodName: z.string().min(1).max(100).optional(),
    mealType: mealTypeSchema,
    consumedAt: isoDateTimeSchema,
    quantityG: z.number().positive().nullable().optional(),
    quantityLabel: z.string().max(30).nullable().optional(),
    spentMoneyKrw: z.number().int().min(0).optional(),
    caloriesKcal: z.number().min(0).optional(),
    proteinG: z.number().min(0).optional(),
    fatG: z.number().min(0).optional(),
    carbsG: z.number().min(0).optional(),
    sourceType: z.enum(["manual", "manual_custom", "recommendation"]).optional(),
    recommendationCandidateId: z.number().int().positive().optional(),
  })
  .refine((value) => value.foodId || (value.foodName && value.caloriesKcal !== undefined), {
    message: "foodId 또는 직접 입력 음식 정보가 필요합니다.",
  })
  .refine((value) => value.sourceType !== "recommendation" || (value.recommendationCandidateId && value.foodId), {
    message: "추천 식단 기록에는 foodId와 recommendationCandidateId가 필요합니다.",
  });

export const updateMealSchema = z.object({
  foodId: z.number().int().positive().optional(),
  mealType: mealTypeSchema.optional(),
  consumedAt: isoDateTimeSchema.optional(),
  quantityG: z.number().positive().nullable().optional(),
  quantityLabel: z.string().max(30).nullable().optional(),
  spentMoneyKrw: z.number().int().min(0).optional(),
});

export const naturalMealParseSchema = z.object({
  text: z.string().trim().min(2).max(500),
  mealType: mealTypeSchema.optional(),
  consumedAt: isoDateTimeSchema.optional(),
});
