import type { Request } from "express";
import { AppError } from "../middleware/AppError.js";

export async function getRequestUserId(req: Request) {
  const rawUserId = req.header("x-ecobi-user-id") ?? req.header("x-user-id");
  const userId = Number(rawUserId);

  if (Number.isInteger(userId) && userId > 0) {
    return userId;
  }

  throw new AppError(401, "AUTH_REQUIRED", "로그인이 필요합니다.");
}
