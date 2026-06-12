import { z } from "zod";
import { mealChannelSchema } from "./recommendationSchemas.js";

function firstString(value: unknown) {
  if (Array.isArray(value)) return typeof value[0] === "string" ? value[0] : undefined;
  return typeof value === "string" ? value : undefined;
}

const optionalQueryStringSchema = z.preprocess((value) => firstString(value), z.string().trim().max(80).optional());

const optionalPositiveIntSchema = z.preprocess((value) => firstString(value), z.coerce.number().int().positive().optional());

const optionalOffsetSchema = z.preprocess((value) => firstString(value), z.coerce.number().int().min(0).optional());

const optionalBooleanSchema = z.preprocess((value) => {
  const text = firstString(value);
  if (text === undefined) return undefined;
  if (["true", "1", "yes", "on"].includes(text.toLowerCase())) return true;
  if (["false", "0", "no", "off"].includes(text.toLowerCase())) return false;
  return undefined;
}, z.boolean().optional());

const csvNumberListSchema = z.preprocess((value) => {
  const text = firstString(value);
  if (!text?.trim()) return undefined;
  return text
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isInteger(item) && item > 0);
}, z.array(z.number().int().positive()).max(100).optional());

const csvStringListSchema = z.preprocess((value) => {
  const text = firstString(value);
  if (!text?.trim()) return undefined;
  return text
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 30);
}, z.array(z.string().max(80)).optional());

export const foodSearchQuerySchema = z.object({
  q: optionalQueryStringSchema,
  exact: optionalBooleanSchema,
  mealChannel: z.preprocess((value) => firstString(value), mealChannelSchema.optional()),
  limit: optionalPositiveIntSchema.transform((value) => (value ? Math.min(value, 50) : undefined)),
  offset: optionalOffsetSchema,
  ids: csvNumberListSchema,
  names: csvStringListSchema,
});
