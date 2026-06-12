import { existsSync } from "node:fs";
import { resolve } from "node:path";
import cors from "cors";
import express from "express";
import { errorHandler } from "./middleware/errorHandler.js";
import { apiRoutes } from "./routes/index.js";
import { runMigrations } from "./database/migrate.js";
import { seedDevData } from "./database/seed.js";

const shouldSeedDevData =
  process.env.SEED_DEV_DATA === "true" ||
  (process.env.NODE_ENV !== "production" && process.env.SEED_DEV_DATA !== "false");

const app = express();
const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1");
const clientOrigin = process.env.CLIENT_ORIGIN ?? (process.env.NODE_ENV === "production" ? undefined : "http://127.0.0.1:5173");
const serveClient = process.env.SERVE_CLIENT !== "false";
const clientDistDir = resolve(process.cwd(), "dist");
const clientIndexPath = resolve(clientDistDir, "index.html");

app.use(clientOrigin ? cors({ origin: clientOrigin }) : cors());
app.use(express.json());

app.use("/api/v1", apiRoutes);

if (serveClient && existsSync(clientIndexPath)) {
  app.use(express.static(clientDistDir));
  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path === "/api" || req.path.startsWith("/api/")) {
      next();
      return;
    }

    res.sendFile(clientIndexPath);
  });
}

app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: "NOT_FOUND",
      message: "요청한 API를 찾을 수 없습니다.",
    },
  });
});

app.use(errorHandler);

await runMigrations();

if (shouldSeedDevData) {
  await seedDevData();
}

app.listen(port, host, () => {
  console.log(`Ecobi API v1 listening on http://${host}:${port}`);
});
