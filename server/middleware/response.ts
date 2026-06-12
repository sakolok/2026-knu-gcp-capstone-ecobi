import type { Response } from "express";

export function sendSuccess<T>(res: Response, data: T, message = "요청이 성공했습니다.", statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    data,
    message,
  });
}
