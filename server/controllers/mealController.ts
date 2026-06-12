import { AppError } from "../middleware/AppError.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { sendSuccess } from "../middleware/response.js";
import {
  createMealLog,
  deleteMealLog,
  getPeriodMealSummary,
  listMealLogs,
  summarizeMeals,
  updateMealLog,
} from "../repositories/mealRepository.js";
import { parseNaturalLanguageMeal } from "../services/aiService.js";
import { getMealInsights } from "../services/mealInsightService.js";
import { getWeekRange, todayISO } from "../utils/date.js";
import { getRequestUserId } from "../utils/requestUser.js";
import { periodQuerySchema } from "../validators/commonSchemas.js";
import { createMealSchema, naturalMealParseSchema, updateMealSchema } from "../validators/mealSchemas.js";

export const listMealsController = asyncHandler(async (req, res) => {
  const query = periodQuerySchema.parse(req.query);
  sendSuccess(res, await listMealLogs(await getRequestUserId(req), query));
});

export const createMealController = asyncHandler(async (req, res) => {
  const body = createMealSchema.parse(req.body);
  const meal = await createMealLog(await getRequestUserId(req), body);
  sendSuccess(res, meal, "식단 기록이 생성되었습니다.", 201);
});

export const parseNaturalMealController = asyncHandler(async (req, res) => {
  const body = naturalMealParseSchema.parse(req.body);
  sendSuccess(res, await parseNaturalLanguageMeal(await getRequestUserId(req), body));
});

export const updateMealController = asyncHandler(async (req, res) => {
  const body = updateMealSchema.parse(req.body);
  const meal = await updateMealLog(await getRequestUserId(req), Number(req.params.id), body);
  if (!meal) throw new AppError(404, "MEAL_NOT_FOUND", "식단 기록을 찾을 수 없습니다.");
  sendSuccess(res, meal, "식단 기록이 수정되었습니다.");
});

export const deleteMealController = asyncHandler(async (req, res) => {
  const deleted = await deleteMealLog(await getRequestUserId(req), Number(req.params.id));
  if (!deleted) throw new AppError(404, "MEAL_NOT_FOUND", "식단 기록을 찾을 수 없습니다.");
  sendSuccess(res, { id: Number(req.params.id) }, "식단 기록이 삭제되었습니다.");
});

export const todayMealsController = asyncHandler(async (req, res) => {
  sendSuccess(res, await listMealLogs(await getRequestUserId(req), { date: todayISO() }));
});

export const recentMealsController = asyncHandler(async (req, res) => {
  sendSuccess(res, await listMealLogs(await getRequestUserId(req), { limit: 8 }));
});

export const weeklyMealsController = asyncHandler(async (req, res) => {
  const referenceDate = typeof req.query.referenceDate === "string" ? req.query.referenceDate : todayISO();
  const week = getWeekRange(referenceDate);
  sendSuccess(res, await getPeriodMealSummary(await getRequestUserId(req), week.startDate, week.endDate));
});

export const mealSummaryController = asyncHandler(async (req, res) => {
  const query = periodQuerySchema.parse(req.query);
  const userId = await getRequestUserId(req);
  if (query.date) {
    const meals = await listMealLogs(userId, { date: query.date });
    sendSuccess(res, summarizeMeals(meals));
    return;
  }
  if (query.startDate && query.endDate) {
    sendSuccess(res, await getPeriodMealSummary(userId, query.startDate, query.endDate));
    return;
  }
  const meals = await listMealLogs(userId, { date: todayISO() });
  sendSuccess(res, summarizeMeals(meals));
});

export const mealInsightsController = asyncHandler(async (req, res) => {
  const query = periodQuerySchema.parse(req.query);
  const week = getWeekRange(todayISO());
  const startDate = query.date ?? query.startDate ?? week.startDate;
  const endDate = query.date ?? query.endDate ?? week.endDate;
  sendSuccess(res, await getMealInsights(await getRequestUserId(req), startDate, endDate));
});
