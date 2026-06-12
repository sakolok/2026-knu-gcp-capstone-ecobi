import { Router } from "express";
import { calendarSummaryController } from "../controllers/calendarController.js";

export const calendarRoutes = Router();

calendarRoutes.get("/calendar/summary", calendarSummaryController);
