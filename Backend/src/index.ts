import "dotenv/config";
import Fastify from "fastify";
import { getConfig } from "./config.js";
import { MSG_SERVER_STARTED } from "./core/strings.js";
import { initInternalDb } from "./lib/db/internal.js";
import { registerRoutes } from "./api/index.js";

async function main() {
  initInternalDb();

  const app = Fastify({ logger: true });
  await app.register(registerRoutes);

  const { PORT } = getConfig();
  await app.listen({ port: PORT, host: "0.0.0.0" });
  console.log(MSG_SERVER_STARTED(PORT));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
