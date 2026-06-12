import { AppError } from "../middleware/AppError.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { sendSuccess } from "../middleware/response.js";
import { completeOnboarding, getAuthSession, loginExistingUser, signupUser } from "../repositories/authRepository.js";
import { getRequestUserId } from "../utils/requestUser.js";
import { loginSchema, onboardingSchema, signupSchema } from "../validators/authSchemas.js";

export const authMeController = asyncHandler(async (req, res) => {
  const session = await getAuthSession(await getRequestUserId(req));
  if (!session) throw new AppError(404, "USER_NOT_FOUND", "사용자를 찾을 수 없습니다.");
  sendSuccess(res, session);
});

export const loginController = asyncHandler(async (req, res) => {
  const body = loginSchema.parse(req.body);
  const session = await loginExistingUser(body);
  if (!session) throw new AppError(401, "INVALID_LOGIN", "아이디 또는 비밀번호가 맞지 않습니다.");
  sendSuccess(res, session, "로그인되었습니다.");
});

export const signupController = asyncHandler(async (req, res) => {
  const body = signupSchema.parse(req.body);
  const session = await signupUser(body);
  if (!session) throw new AppError(409, "LOGIN_ID_TAKEN", "이미 사용 중인 아이디입니다.");
  sendSuccess(res, session, "회원가입되었습니다.", 201);
});

export const onboardingController = asyncHandler(async (req, res) => {
  const body = onboardingSchema.parse(req.body);
  const session = await completeOnboarding(await getRequestUserId(req), body);
  if (!session) throw new AppError(404, "USER_NOT_FOUND", "사용자를 찾을 수 없습니다.");
  sendSuccess(res, session, "온보딩 정보가 저장되었습니다.");
});
