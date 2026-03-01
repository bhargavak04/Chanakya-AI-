import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { getInternalDb, generateId } from "../../lib/db/internal.js";
import { testConnection, getConnectionConfig } from "../../lib/db/connections.js";
import type { DbType } from "../../types/index.js";

const createSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["postgresql", "mysql"]),
  host: z.string().min(1),
  port: z.coerce.number(),
  database: z.string().min(1),
  username: z.string().min(1),
  password: z.string(),
  ssl_required: z.boolean().default(true),
});

export const databaseRoutes: FastifyPluginAsync = async (app) => {
  app.get("/databases", async () => {
    const db = getInternalDb();
    const rows = db
      .prepare(
        "SELECT id, name, type, host, port, database, username, created_at FROM databases ORDER BY created_at DESC"
      )
      .all() as { id: string; name: string; type: string; host: string; port: number; database: string; username: string; created_at: string }[];
    return { databases: rows };
  });

  app.post("/databases", async (req, reply) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      const issues = parsed.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ");
      req.log.warn({ body: req.body, issues }, "Validation failed");
      return reply.status(400).send({
        error: "Validation failed",
        details: issues,
        fieldErrors: parsed.error.flatten().fieldErrors,
      });
    }
    const config = parsed.data;

    const result = await testConnection({
      name: config.name,
      type: config.type as DbType,
      host: config.host,
      port: config.port,
      database: config.database,
      username: config.username,
      password: config.password,
      ssl_required: config.ssl_required,
    });

    if (!result.ok) {
      req.log.warn(
        { host: config.host, port: config.port, database: config.database, error: result.error },
        "Connection test failed"
      );
      return reply.status(400).send({
        error: "Connection failed",
        details: result.error,
      });
    }

    const db = getInternalDb();
    const id = generateId();
    const sslRequired = config.ssl_required !== false ? 1 : 0;
    db.prepare(
      `INSERT INTO databases (id, name, type, host, port, database, username, password, ssl_required)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, config.name, config.type, config.host, config.port, config.database, config.username, config.password, sslRequired);

    return reply.status(201).send({ id, name: config.name, type: config.type });
  });

  app.post("/databases/:id/test", async (req, reply) => {
    const config = getConnectionConfig((req.params as { id: string }).id);
    if (!config) return reply.status(404).send({ error: "Database not found" });
    const result = await testConnection(config);
    if (!result.ok) {
      req.log.warn({ dbId: config.id, error: result.error }, "Connection test failed");
      return reply.status(400).send({ ok: false, error: result.error });
    }
    return { ok: true };
  });

  app.delete("/databases/:id", async (req, reply) => {
    const db = getInternalDb();
    const id = (req.params as { id: string }).id;
    const result = db.prepare("DELETE FROM databases WHERE id = ?").run(id);
    if (result.changes === 0) return reply.status(404).send({ error: "Database not found" });
    return { deleted: id };
  });
};
