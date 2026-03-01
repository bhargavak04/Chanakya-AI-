/**
 * Centralized configuration with env validation
 */
import { z } from "zod";
import { join } from "path";

const envSchema = z.object({
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  GROQ_API_KEY: z.string().optional(),
  DATA_DIR: z.string().default("./data"),
});

export type Config = z.infer<typeof envSchema>;

let config: Config | null = null;

export function getConfig(): Config {
  if (!config) {
    const parsed = envSchema.safeParse({
      PORT: process.env.PORT,
      NODE_ENV: process.env.NODE_ENV,
      GROQ_API_KEY: process.env.GROQ_API_KEY,
      DATA_DIR: process.env.DATA_DIR,
    });

    if (!parsed.success) {
      const msg = parsed.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("\n");
      throw new Error(`Config validation failed:\n${msg}`);
    }
    config = parsed.data;
  }
  return config;
}

export function getDbPath(): string {
  const { DATA_DIR } = getConfig();
  return join(process.cwd(), DATA_DIR, "pulse.sqlite");
}
