import type { FastifyPluginAsync } from "fastify";
import { ingestSchema } from "../../lib/schema/ingestion.js";
import { getSchemaForDb } from "../../lib/schema/retrieval.js";
import { getConnectionConfig } from "../../lib/db/connections.js";

export const schemaRoutes: FastifyPluginAsync = async (app) => {
  app.post("/schema/:dbId/ingest", async (req, reply) => {
    const dbId = (req.params as { dbId: string }).dbId;
    const config = getConnectionConfig(dbId);
    if (!config) return reply.status(404).send({ error: "Database not found" });
    try {
      const result = await ingestSchema(dbId);
      return { ...result, dbId };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Ingestion failed";
      req.log.warn({ dbId, err }, "Schema ingestion failed");
      return reply.status(500).send({ error: msg });
    }
  });

  app.get("/schema/:dbId", async (req, reply) => {
    const dbId = (req.params as { dbId: string }).dbId;
    const config = getConnectionConfig(dbId);
    if (!config) return reply.status(404).send({ error: "Database not found" });
    const tables = getSchemaForDb(dbId);
    return { dbId, tables };
  });
};
