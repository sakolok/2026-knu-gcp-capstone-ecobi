import { AppError } from "../middleware/AppError.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { sendSuccess } from "../middleware/response.js";
import { getRecommendationReason } from "../repositories/recommendationRepository.js";
import { createRecommendationAiExplanation } from "../services/aiService.js";
import {
  createRecommendationJob,
  getRecommendationJob,
  getRecommendations,
  logRecommendation,
  recommendationTabs,
  selectRecommendation,
  submitRecommendationFeedback,
} from "../services/recommendationService.js";
import { getRequestUserId } from "../utils/requestUser.js";
import {
  logRecommendationSchema,
  recommendationAiExplanationSchema,
  recommendationFeedbackSchema,
  recommendationQuerySchema,
} from "../validators/recommendationSchemas.js";

export const listRecommendationsController = asyncHandler(async (req, res) => {
  const query = recommendationQuerySchema.parse(req.query);
  sendSuccess(res, await getRecommendations(await getRequestUserId(req), query));
});

export const goalRecommendationsController = asyncHandler(async (req, res) => {
  const query = recommendationQuerySchema.parse(req.query);
  sendSuccess(res, await getRecommendations(await getRequestUserId(req), { ...query, intent: query.intent ?? "personal" }));
});

export const createRecommendationJobController = asyncHandler(async (req, res) => {
  const body = recommendationQuerySchema.parse(req.body ?? {});
  const job = await createRecommendationJob(await getRequestUserId(req), body);
  if (!job) throw new AppError(404, "USER_PROFILE_NOT_FOUND", "추천 작업을 만들 사용자 프로필을 찾을 수 없습니다.");
  sendSuccess(res, job, "추천 작업이 접수되었습니다.", 202);
});

export const recommendationJobController = asyncHandler(async (req, res) => {
  const job = await getRecommendationJob(await getRequestUserId(req), Number(req.params.runId));
  if (!job) throw new AppError(404, "RECOMMENDATION_JOB_NOT_FOUND", "추천 작업을 찾을 수 없습니다.");
  sendSuccess(res, job);
});

export const recommendationTabsController = asyncHandler(async (_req, res) => {
  sendSuccess(res, recommendationTabs);
});

export const recommendationReasonController = asyncHandler(async (req, res) => {
  sendSuccess(res, {
    id: Number(req.params.id),
    reasons: await getRecommendationReason(Number(req.params.id)),
  });
});

export const recommendationAiExplanationController = asyncHandler(async (req, res) => {
  const body = recommendationAiExplanationSchema.parse(req.body ?? {});
  const explanation = await createRecommendationAiExplanation(await getRequestUserId(req), Number(req.params.id), body.intent);
  if (!explanation) throw new AppError(404, "RECOMMENDATION_NOT_FOUND", "AI 설명을 만들 추천 결과를 찾을 수 없습니다.");
  sendSuccess(res, explanation);
});

export const selectRecommendationController = asyncHandler(async (req, res) => {
  const selected = await selectRecommendation(await getRequestUserId(req), Number(req.params.id));
  if (!selected) throw new AppError(404, "RECOMMENDATION_NOT_FOUND", "추천 결과를 찾을 수 없습니다.");
  sendSuccess(res, selected, "추천 식단이 선택되었습니다.");
});

export const recommendationFeedbackController = asyncHandler(async (req, res) => {
  const body = recommendationFeedbackSchema.parse(req.body);
  const saved = await submitRecommendationFeedback(await getRequestUserId(req), Number(req.params.id), body.feedback, body.metadata);
  if (!saved) throw new AppError(404, "RECOMMENDATION_NOT_FOUND", "추천 피드백을 저장할 추천 결과를 찾을 수 없습니다.");
  sendSuccess(res, saved, "추천 피드백이 저장되었습니다.", 201);
});

export const logRecommendationController = asyncHandler(async (req, res) => {
  const body = logRecommendationSchema.parse(req.body);
  const meal = await logRecommendation(await getRequestUserId(req), Number(req.params.id), {
    consumedAt: body.consumedAt,
    mealType: body.mealType,
  });
  if (!meal) throw new AppError(404, "RECOMMENDATION_NOT_FOUND", "추천 결과를 식단으로 기록할 수 없습니다.");
  sendSuccess(res, meal, "추천 식단이 기록되었습니다.", 201);
});
