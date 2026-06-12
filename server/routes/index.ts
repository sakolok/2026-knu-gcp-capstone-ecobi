import { Router } from "express";
import { calendarRoutes } from "./calendarRoutes.js";
import { dashboardController } from "../controllers/dashboardController.js";
import { catalogRoutes } from "./catalogRoutes.js";
import { mealRoutes } from "./mealRoutes.js";
import { profileRoutes } from "./profileRoutes.js";
import { recommendationRoutes } from "./recommendationRoutes.js";
import { recoveryRoutes } from "./recoveryRoutes.js";
import { weightRoutes } from "./weightRoutes.js";
import { planRoutes } from "./planRoutes.js";
import { authRoutes } from "./authRoutes.js";

export const apiRoutes = Router();

apiRoutes.get("/health", (_req, res) => {
  res.json({
    success: true,
    data: {
      status: "ok",
      service: "ecobi-api",
      version: "v1",
    },
    message: "요청이 성공했습니다.",
  });
});

apiRoutes.get("/dashboard", dashboardController);
apiRoutes.use(authRoutes);
apiRoutes.use(calendarRoutes);
apiRoutes.use(profileRoutes);
apiRoutes.use(weightRoutes);
apiRoutes.use(mealRoutes);
apiRoutes.use(recommendationRoutes);
apiRoutes.use(recoveryRoutes);
apiRoutes.use(planRoutes);
apiRoutes.use(catalogRoutes);
