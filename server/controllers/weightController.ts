import { AppError } from "../middleware/AppError.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { sendSuccess } from "../middleware/response.js";
import {
  createWeightRecord,
  deleteWeightRecord,
  getWeightChart,
  getWeightSummary,
  listWeightRecords,
  updateWeightRecord,
} from "../repositories/weightRepository.js";
import { getWeightDashboard } from "../services/weightDashboardService.js";
import { getRequestUserId } from "../utils/requestUser.js";
import { periodQuerySchema, rangeQuerySchema } from "../validators/commonSchemas.js";
import { createWeightSchema, updateWeightSchema } from "../validators/weightSchemas.js";

export const listWeightsController = asyncHandler(async (req, res) => {
  const query = periodQuerySchema.parse(req.query);
  sendSuccess(res, await listWeightRecords(await getRequestUserId(req), query));
});

export const createWeightController = asyncHandler(async (req, res) => {
  const body = createWeightSchema.parse(req.body);
  const record = await createWeightRecord(await getRequestUserId(req), body);
  sendSuccess(res, record, "체중 기록이 생성되었습니다.", 201);
});

export const updateWeightController = asyncHandler(async (req, res) => {
  const body = updateWeightSchema.parse(req.body);
  const record = await updateWeightRecord(await getRequestUserId(req), Number(req.params.id), body);
  if (!record) throw new AppError(404, "WEIGHT_NOT_FOUND", "체중 기록을 찾을 수 없습니다.");
  sendSuccess(res, record, "체중 기록이 수정되었습니다.");
});

export const deleteWeightController = asyncHandler(async (req, res) => {
  const deleted = await deleteWeightRecord(await getRequestUserId(req), Number(req.params.id));
  if (!deleted) throw new AppError(404, "WEIGHT_NOT_FOUND", "체중 기록을 찾을 수 없습니다.");
  sendSuccess(res, { id: Number(req.params.id) }, "체중 기록이 삭제되었습니다.");
});

export const weightChartController = asyncHandler(async (req, res) => {
  const query = periodQuerySchema.parse(req.query);
  sendSuccess(res, await getWeightChart(await getRequestUserId(req), query));
});

export const weightSummaryController = asyncHandler(async (req, res) => {
  sendSuccess(res, await getWeightSummary(await getRequestUserId(req)));
});

export const weightDashboardController = asyncHandler(async (req, res) => {
  const query = rangeQuerySchema.parse(req.query);
  sendSuccess(
    res,
    await getWeightDashboard(await getRequestUserId(req), {
      rangeType: query.rangeType,
      startDate: query.startDate ?? query.date,
      endDate: query.endDate ?? query.date,
    }),
  );
});
