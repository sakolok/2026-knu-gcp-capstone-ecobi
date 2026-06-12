import { AppError } from "../middleware/AppError.js";
import { sendSuccess } from "../middleware/response.js";
import {
  createUserInteraction,
  getProfile,
  replaceAllergies,
  replacePreferences,
  toggleFoodFavorite,
  updateBody,
  updateBudget,
  updateCalories,
  updateDemographics,
  updateGoal,
  updateProfileBasics,
} from "../repositories/profileRepository.js";
import { getRequestUserId } from "../utils/requestUser.js";
import {
  createUserInteractionSchema,
  toggleFoodFavoriteSchema,
  updateAllergiesSchema,
  updateBodySchema,
  updateBudgetSchema,
  updateCaloriesSchema,
  updateDemographicsSchema,
  updateGoalSchema,
  updatePreferencesSchema,
  updateProfileSchema,
} from "../validators/profileSchemas.js";
import { asyncHandler } from "../middleware/asyncHandler.js";

export const getProfileController = asyncHandler(async (req, res) => {
  const profile = await getProfile(await getRequestUserId(req));
  if (!profile) throw new AppError(404, "PROFILE_NOT_FOUND", "프로필을 찾을 수 없습니다.");
  sendSuccess(res, profile);
});

export const getGoalController = asyncHandler(async (req, res) => {
  const profile = await getProfile(await getRequestUserId(req));
  if (!profile) throw new AppError(404, "PROFILE_NOT_FOUND", "프로필을 찾을 수 없습니다.");
  sendSuccess(res, {
    goalType: profile.goalType,
    currentWeightKg: profile.currentWeightKg,
    targetWeightKg: profile.targetWeightKg,
    targetCaloriesKcal: profile.targetCaloriesKcal,
    targetCalorieDeltaKcal: profile.targetCalorieDeltaKcal,
    weeklyBudgetKrw: profile.weeklyBudgetKrw,
  });
});

export const updateGoalController = asyncHandler(async (req, res) => {
  const body = updateGoalSchema.parse(req.body);
  const updated = await updateGoal(await getRequestUserId(req), body);
  if (!updated) throw new AppError(404, "PROFILE_NOT_FOUND", "프로필을 찾을 수 없습니다.");
  sendSuccess(res, updated, "목표가 수정되었습니다.");
});

export const updateProfileController = asyncHandler(async (req, res) => {
  const body = updateProfileSchema.parse(req.body);
  const updated = await updateProfileBasics(await getRequestUserId(req), {
    displayName: body.displayName,
    email: body.email === "" ? null : body.email,
  });
  if (!updated) throw new AppError(404, "PROFILE_NOT_FOUND", "프로필을 찾을 수 없습니다.");
  sendSuccess(res, updated, "프로필이 수정되었습니다.");
});

export const updateBudgetController = asyncHandler(async (req, res) => {
  const body = updateBudgetSchema.parse(req.body);
  const updated = await updateBudget(await getRequestUserId(req), body.weeklyBudgetKrw);
  if (!updated) throw new AppError(404, "PROFILE_NOT_FOUND", "프로필을 찾을 수 없습니다.");
  sendSuccess(res, updated, "예산이 수정되었습니다.");
});

export const updateCaloriesController = asyncHandler(async (req, res) => {
  const body = updateCaloriesSchema.parse(req.body);
  const updated = await updateCalories(await getRequestUserId(req), body.targetCaloriesKcal);
  if (!updated) throw new AppError(404, "PROFILE_NOT_FOUND", "프로필을 찾을 수 없습니다.");
  sendSuccess(res, updated, "칼로리 기준이 수정되었습니다.");
});

export const updateBodyController = asyncHandler(async (req, res) => {
  const body = updateBodySchema.parse(req.body);
  const updated = await updateBody(await getRequestUserId(req), body);
  if (!updated) throw new AppError(404, "PROFILE_NOT_FOUND", "프로필을 찾을 수 없습니다.");
  sendSuccess(res, updated, "신체 정보가 수정되었습니다.");
});

export const updateDemographicsController = asyncHandler(async (req, res) => {
  const body = updateDemographicsSchema.parse(req.body);
  const updated = await updateDemographics(await getRequestUserId(req), body);
  if (!updated) throw new AppError(404, "PROFILE_NOT_FOUND", "프로필을 찾을 수 없습니다.");
  sendSuccess(res, updated, "기본 정보가 수정되었습니다.");
});

export const updateAllergiesController = asyncHandler(async (req, res) => {
  const body = updateAllergiesSchema.parse(req.body);
  const updated = await replaceAllergies(await getRequestUserId(req), body.allergies);
  if (!updated) throw new AppError(404, "PROFILE_NOT_FOUND", "프로필을 찾을 수 없습니다.");
  sendSuccess(res, updated, "알레르기 정보가 수정되었습니다.");
});

export const updatePreferencesController = asyncHandler(async (req, res) => {
  const body = updatePreferencesSchema.parse(req.body);
  const updated = await replacePreferences(await getRequestUserId(req), body);
  if (!updated) throw new AppError(404, "PROFILE_NOT_FOUND", "프로필을 찾을 수 없습니다.");
  sendSuccess(res, updated, "음식 선호도가 수정되었습니다.");
});

export const toggleFoodFavoriteController = asyncHandler(async (req, res) => {
  const body = toggleFoodFavoriteSchema.parse(req.body);
  sendSuccess(res, await toggleFoodFavorite(await getRequestUserId(req), body.foodId), "즐겨찾기가 변경되었습니다.");
});

export const createUserInteractionController = asyncHandler(async (req, res) => {
  const body = createUserInteractionSchema.parse(req.body);
  sendSuccess(res, await createUserInteraction(await getRequestUserId(req), body), "사용자 반응이 저장되었습니다.", 201);
});
