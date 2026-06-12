import { asyncHandler } from "../middleware/asyncHandler.js";
import { sendSuccess } from "../middleware/response.js";
import { listFoods, searchFoods } from "../repositories/foodRepository.js";
import { foodSearchQuerySchema } from "../validators/catalogSchemas.js";

export const listFoodsController = asyncHandler(async (_req, res) => {
  sendSuccess(res, await listFoods());
});

export const searchFoodsController = asyncHandler(async (req, res) => {
  const query = foodSearchQuerySchema.parse(req.query);
  sendSuccess(res, await searchFoods(query));
});
