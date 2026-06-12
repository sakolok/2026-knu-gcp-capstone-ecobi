import { Router } from "express";
import {
  createUserInteractionController,
  getGoalController,
  getProfileController,
  toggleFoodFavoriteController,
  updateAllergiesController,
  updateBodyController,
  updateBudgetController,
  updateCaloriesController,
  updateDemographicsController,
  updateGoalController,
  updatePreferencesController,
  updateProfileController,
} from "../controllers/profileController.js";

export const profileRoutes = Router();

profileRoutes.get("/users/me/profile", getProfileController);
profileRoutes.patch("/users/me/profile", updateProfileController);
profileRoutes.get("/users/me/goals", getGoalController);
profileRoutes.patch("/users/me/goals", updateGoalController);
profileRoutes.patch("/users/me/budget", updateBudgetController);
profileRoutes.patch("/users/me/calories", updateCaloriesController);
profileRoutes.patch("/users/me/body", updateBodyController);
profileRoutes.patch("/users/me/demographics", updateDemographicsController);
profileRoutes.patch("/users/me/allergies", updateAllergiesController);
profileRoutes.patch("/users/me/preferences", updatePreferencesController);
profileRoutes.post("/users/me/favorites", toggleFoodFavoriteController);
profileRoutes.post("/users/me/interactions", createUserInteractionController);
