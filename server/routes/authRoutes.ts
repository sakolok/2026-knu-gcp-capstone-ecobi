import { Router } from "express";
import { authMeController, loginController, onboardingController, signupController } from "../controllers/authController.js";

export const authRoutes = Router();

authRoutes.get("/auth/me", authMeController);
authRoutes.post("/auth/login", loginController);
authRoutes.post("/auth/signup", signupController);
authRoutes.post("/auth/onboarding", onboardingController);
