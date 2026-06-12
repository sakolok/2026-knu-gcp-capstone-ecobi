import { Router } from "express";
import {
  createMealController,
  deleteMealController,
  listMealsController,
  mealInsightsController,
  mealSummaryController,
  parseNaturalMealController,
  recentMealsController,
  todayMealsController,
  updateMealController,
  weeklyMealsController,
} from "../controllers/mealController.js";

export const mealRoutes = Router();

mealRoutes.get("/meals", listMealsController);
mealRoutes.post("/meals", createMealController);
mealRoutes.post("/meals/ai-parse", parseNaturalMealController);
mealRoutes.get("/meals/today", todayMealsController);
mealRoutes.get("/meals/recent", recentMealsController);
mealRoutes.get("/meals/weekly", weeklyMealsController);
mealRoutes.get("/meals/summary", mealSummaryController);
mealRoutes.get("/meals/insights", mealInsightsController);
mealRoutes.patch("/meals/:id", updateMealController);
mealRoutes.delete("/meals/:id", deleteMealController);
