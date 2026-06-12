import { asyncHandler } from "../middleware/asyncHandler.js";
import { sendSuccess } from "../middleware/response.js";
import { getCalendarSummary } from "../repositories/calendarRepository.js";
import { getRequestUserId } from "../utils/requestUser.js";
import { todayISO } from "../utils/date.js";
import { isoDateSchema } from "../validators/commonSchemas.js";

export const calendarSummaryController = asyncHandler(async (req, res) => {
  const referenceDate = isoDateSchema.optional().parse(req.query.referenceDate) ?? todayISO();
  sendSuccess(res, await getCalendarSummary(await getRequestUserId(req), referenceDate));
});
