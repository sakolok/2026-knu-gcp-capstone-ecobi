import { asyncHandler } from "../middleware/asyncHandler.js";
import { sendSuccess } from "../middleware/response.js";
import { AppError } from "../middleware/AppError.js";
import { createShockRecoveryPlan, deleteShockRecoveryPlan, generateWeeklyPlan, getWeeklyPlan, listRecoveryRevisions } from "../repositories/planRepository.js";
import { getRequestUserId } from "../utils/requestUser.js";
import { shockEventParamsSchema, shockEventSchema, weeklyPlanQuerySchema } from "../validators/planSchemas.js";

export const weeklyPlanController = asyncHandler(async (req, res) => {
  const query = weeklyPlanQuerySchema.parse(req.query);
  sendSuccess(res, await getWeeklyPlan(await getRequestUserId(req), query.referenceDate));
});

export const generateWeeklyPlanController = asyncHandler(async (req, res) => {
  const body = weeklyPlanQuerySchema.parse(req.body ?? {});
  sendSuccess(res, await generateWeeklyPlan(await getRequestUserId(req), body.referenceDate), "주간 식단 계획이 생성되었습니다.", 201);
});

export const recoveryPlansController = asyncHandler(async (req, res) => {
  sendSuccess(res, await listRecoveryRevisions(await getRequestUserId(req)));
});

export const createShockRecoveryController = asyncHandler(async (req, res) => {
  const body = shockEventSchema.parse(req.body);
  sendSuccess(res, await createShockRecoveryPlan(await getRequestUserId(req), body), "회복 계획이 생성되었습니다.", 201);
});

export const deleteShockRecoveryController = asyncHandler(async (req, res) => {
  const { shockEventId } = shockEventParamsSchema.parse(req.params);
  const deleted = await deleteShockRecoveryPlan(await getRequestUserId(req), shockEventId);
  if (!deleted) throw new AppError(404, "SHOCK_EVENT_NOT_FOUND", "예상 이벤트를 찾을 수 없습니다.");
  sendSuccess(res, { deleted: true }, "예상 이벤트가 삭제되었습니다.");
});
