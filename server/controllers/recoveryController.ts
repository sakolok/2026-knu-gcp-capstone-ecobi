import { AppError } from "../middleware/AppError.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { sendSuccess } from "../middleware/response.js";
import { getRecoverySummary } from "../services/recoveryService.js";
import { getRequestUserId } from "../utils/requestUser.js";

export const recoverySummaryController = asyncHandler(async (req, res) => {
  const summary = await getRecoverySummary(await getRequestUserId(req));
  if (!summary) throw new AppError(404, "RECOVERY_SUMMARY_NOT_FOUND", "회복 요약을 만들 수 없습니다.");
  sendSuccess(res, summary);
});
