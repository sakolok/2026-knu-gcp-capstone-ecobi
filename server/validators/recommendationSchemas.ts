import { z } from "zod";
import { isoDateTimeSchema, mealTypeSchema } from "./commonSchemas.js";

export const recommendationIntentSchema = z.enum(["personal", "recovery", "protein", "budget"]);
export const mealChannelSchema = z.enum(["convenience_store", "cafeteria", "home_meal", "delivery"]);

export const recommendationQuerySchema = z.object({
  mealType: mealTypeSchema.optional(),
  intent: recommendationIntentSchema.optional(),
  mealChannel: mealChannelSchema.optional(),
  limit: z.coerce.number().int().positive().max(20).optional(),
  mealSequence: z.coerce.number().int().positive().optional(),
  targetMealBudgetKrw: z.coerce.number().int().min(0).optional(),
  targetMealCaloriesKcal: z.coerce.number().positive().optional(),
  todayBudgetKrw: z.coerce.number().int().min(0).optional(),
});

export const logRecommendationSchema = z.object({
  consumedAt: isoDateTimeSchema.optional(),
  mealType: mealTypeSchema.optional(),
});

export const recommendationFeedbackSchema = z.object({
  feedback: z.enum(["accepted", "rejected"]),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const recommendationAiExplanationSchema = z.object({
  intent: recommendationIntentSchema.optional(),
});
