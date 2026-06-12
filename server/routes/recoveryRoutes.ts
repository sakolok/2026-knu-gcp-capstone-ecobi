import { Router } from "express";
import { recoverySummaryController } from "../controllers/recoveryController.js";

export const recoveryRoutes = Router();

recoveryRoutes.get("/recovery/summary", recoverySummaryController);
