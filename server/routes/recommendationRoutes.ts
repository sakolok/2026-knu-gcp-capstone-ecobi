import { Router } from "express";
import {
  createRecommendationJobController,
  goalRecommendationsController,
  listRecommendationsController,
  logRecommendationController,
  recommendationJobController,
  recommendationFeedbackController,
  recommendationAiExplanationController,
  recommendationReasonController,
  recommendationTabsController,
  selectRecommendationController,
} from "../controllers/recommendationController.js";

export const recommendationRoutes = Router();

recommendationRoutes.get("/recommendations", listRecommendationsController);
recommendationRoutes.get("/recommendations/goals", goalRecommendationsController);
recommendationRoutes.post("/recommendations/jobs", createRecommendationJobController);
recommendationRoutes.get("/recommendations/jobs/:runId", recommendationJobController);
recommendationRoutes.get("/recommendations/tabs", recommendationTabsController);
recommendationRoutes.get("/recommendations/:id/reason", recommendationReasonController);
recommendationRoutes.post("/recommendations/:id/ai-explanation", recommendationAiExplanationController);
recommendationRoutes.post("/recommendations/:id/select", selectRecommendationController);
recommendationRoutes.post("/recommendations/:id/feedback", recommendationFeedbackController);
recommendationRoutes.post("/recommendations/:id/log", logRecommendationController);
