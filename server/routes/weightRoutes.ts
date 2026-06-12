import { Router } from "express";
import {
  createWeightController,
  deleteWeightController,
  listWeightsController,
  updateWeightController,
  weightDashboardController,
  weightChartController,
  weightSummaryController,
} from "../controllers/weightController.js";

export const weightRoutes = Router();

weightRoutes.get("/weights", listWeightsController);
weightRoutes.post("/weights", createWeightController);
weightRoutes.get("/weights/dashboard", weightDashboardController);
weightRoutes.get("/weights/chart", weightChartController);
weightRoutes.get("/weights/summary", weightSummaryController);
weightRoutes.patch("/weights/:id", updateWeightController);
weightRoutes.delete("/weights/:id", deleteWeightController);
