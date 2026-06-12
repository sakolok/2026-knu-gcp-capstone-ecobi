import { Router } from "express";
import {
  createShockRecoveryController,
  deleteShockRecoveryController,
  generateWeeklyPlanController,
  recoveryPlansController,
  weeklyPlanController,
} from "../controllers/planController.js";

export const planRoutes = Router();

planRoutes.get("/weekly-plan", weeklyPlanController);
planRoutes.post("/weekly-plan/generate", generateWeeklyPlanController);
planRoutes.get("/recovery/plans", recoveryPlansController);
planRoutes.post("/recovery/shocks", createShockRecoveryController);
planRoutes.delete("/recovery/shocks/:shockEventId", deleteShockRecoveryController);
