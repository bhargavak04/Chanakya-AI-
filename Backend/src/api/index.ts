import type { FastifyPluginAsync } from "fastify";
import cors from "@fastify/cors";
import { healthRoutes } from "./routes/health.js";
import { databaseRoutes } from "./routes/databases.js";
import { schemaRoutes } from "./routes/schema.js";
import { chatRoutes } from "./routes/chat.js";
import { exportRoutes } from "./routes/export.js";

export const registerRoutes: FastifyPluginAsync = async (app) => {
  await app.register(cors, { origin: true });
  await app.register(healthRoutes, { prefix: "/api" });
  await app.register(databaseRoutes, { prefix: "/api" });
  await app.register(schemaRoutes, { prefix: "/api" });
  await app.register(chatRoutes, { prefix: "/api" });
  await app.register(exportRoutes, { prefix: "/api" });
};
