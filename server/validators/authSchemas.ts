import { z } from "zod";
import { goalTypeSchema } from "./commonSchemas.js";

const textListSchema = z.array(z.string().trim().min(1).max(80)).max(30);
const mealChannelSchema = z.enum(["convenience_store", "cafeteria", "home_meal", "delivery"]);
const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

function isValidISODate(value: string) {
  if (!isoDatePattern.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

function isAllowedBirthDate(value: string) {
  if (!isValidISODate(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const birth = new Date(Date.UTC(year, month - 1, day));
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const minDate = new Date(today);
  minDate.setUTCFullYear(minDate.getUTCFullYear() - 120);
  return birth <= today && birth >= minDate;
}

const birthDateSchema = z
  .string()
  .trim()
  .regex(isoDatePattern, "생년월일 형식이 올바르지 않습니다.")
  .refine(isAllowedBirthDate, "생년월일은 오늘 이전의 올바른 날짜로 입력해 주세요.");

export const loginSchema = z.object({
  loginId: z.string().trim().min(1).max(80),
  password: z.string().min(1).max(200),
});

export const signupSchema = z.object({
  loginId: z
    .string()
    .trim()
    .min(3, "아이디는 3자 이상이어야 합니다.")
    .max(80, "아이디는 80자 이하여야 합니다.")
    .regex(/^\S+$/, "아이디에는 공백을 사용할 수 없습니다."),
  password: z.string().min(8, "비밀번호는 8자 이상이어야 합니다.").max(200),
});

export const onboardingSchema = z.object({
  displayName: z.string().trim().min(1).max(50),
  birthDate: birthDateSchema.optional(),
  sex: z.enum(["female", "male"]),
  heightCm: z.coerce.number().min(120).max(230),
  weightKg: z.coerce.number().min(30).max(250),
  targetWeightKg: z.coerce.number().min(30).max(250),
  goalType: goalTypeSchema,
  activityLevel: z.enum(["sedentary", "light", "moderate", "active", "athlete"]),
  dietType: z.string().trim().min(1).max(80),
  mealTimes: z.object({
    breakfast: z.string().trim().regex(/^\d{2}:\d{2}$/),
    lunch: z.string().trim().regex(/^\d{2}:\d{2}$/),
    dinner: z.string().trim().regex(/^\d{2}:\d{2}$/),
  }),
  allergies: textListSchema,
  dislikedFoods: textListSchema,
  weeklyBudgetKrw: z.coerce.number().int().min(10000).max(5000000),
  availableMealChannels: z.array(mealChannelSchema).min(1).max(4),
});
