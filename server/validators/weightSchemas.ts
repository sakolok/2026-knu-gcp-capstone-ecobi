import { z } from "zod";
import { isoDateTimeSchema } from "./commonSchemas.js";

export const createWeightSchema = z.object({
  measuredAt: isoDateTimeSchema,
  weightKg: z.number().positive().max(300),
  heightCm: z.number().positive().max(260).optional(),
  bodyFatPercent: z.number().min(0).max(80).optional(),
  skeletalMuscleKg: z.number().min(0).max(120).optional(),
  note: z.string().max(300).optional(),
});

export const updateWeightSchema = createWeightSchema.partial();
