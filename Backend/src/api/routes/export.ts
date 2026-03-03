/**
 * Export routes - CSV/Excel
 * Phase 1: Stub - will be implemented in Phase 5
 */
import type { FastifyPluginAsync } from "fastify";
import { ERR_DATA_ARRAY_REQUIRED } from "../../core/strings.js";
import { DEFAULT_EXPORT_FILENAME } from "../../core/constants.js";

export const exportRoutes: FastifyPluginAsync = async (app) => {
  app.post("/export/csv", async (req, reply) => {
    const body = req.body as { data?: Record<string, unknown>[]; filename?: string };
    if (!body.data || !Array.isArray(body.data)) {
      return reply.status(400).send({ error: ERR_DATA_ARRAY_REQUIRED });
    }
    // Simple CSV generation
    const keys = body.data.length > 0 ? Object.keys(body.data[0]) : [];
    const header = keys.join(",");
    const rows = body.data.map((r) => keys.map((k) => JSON.stringify(r[k] ?? "")).join(","));
    const csv = [header, ...rows].join("\n");
    const filename = (body.filename ?? DEFAULT_EXPORT_FILENAME) + ".csv";
    return reply
      .header("Content-Type", "text/csv")
      .header("Content-Disposition", `attachment; filename="${filename}"`)
      .send(csv);
  });
};
