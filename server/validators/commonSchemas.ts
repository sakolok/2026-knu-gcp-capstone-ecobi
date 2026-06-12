import { z } from "zod";

export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const isoDateTimeSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/);

export const mealTypeSchema = z.enum(["breakfast", "lunch", "dinner", "snack"]);
export const goalTypeSchema = z.enum(["maintain", "cut", "bulk"]);
export const rangeTypeSchema = z.enum(["week", "month", "custom"]);

export const periodQuerySchema = z.object({
  date: isoDateSchema.optional(),
  startDate: isoDateSchema.optional(),
  endDate: isoDateSchema.optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

export const rangeQuerySchema = periodQuerySchema.extend({
  rangeType: rangeTypeSchema.optional(),
});
