import { Router } from "express";
import { listFoodsController, searchFoodsController } from "../controllers/catalogController.js";

export const catalogRoutes = Router();

catalogRoutes.get("/catalog/foods/search", searchFoodsController);
catalogRoutes.get("/catalog/foods", listFoodsController);
