import { AppError } from "../middleware/AppError.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { sendSuccess } from "../middleware/response.js";
import { getDashboardSummary } from "../services/dashboardService.js";
import { getRequestUserId } from "../utils/requestUser.js";

export const dashboardController = asyncHandler(async (req, res) => {
  const dashboard = await getDashboardSummary(await getRequestUserId(req));
  if (!dashboard) throw new AppError(404, "DASHBOARD_NOT_FOUND", "대시보드 데이터를 찾을 수 없습니다.");
  sendSuccess(res, dashboard);
});
