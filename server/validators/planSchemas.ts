import { z } from "zod";
import { isoDateSchema } from "./commonSchemas.js";

export const weeklyPlanQuerySchema = z.object({
  referenceDate: isoDateSchema.optional(),
});

export const shockEventSchema = z.object({
  eventType: z.enum(["company_dinner", "delivery", "eating_out", "other"]),
  expectedSpendKrw: z.coerce.number().int().min(0).max(500000),
  eventDayIndex: z.coerce.number().int().min(0).max(6),
  note: z.string().trim().max(200).optional(),
  referenceDate: isoDateSchema.optional(),
});

export const shockEventParamsSchema = z.object({
  shockEventId: z.coerce.number().int().positive(),
});
