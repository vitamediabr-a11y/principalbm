import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url().startsWith("postgresql://"),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url(),
  APP_TIME_ZONE: z.string().min(1).default("America/Belem"),
});

export const env = envSchema.parse({
  NODE_ENV: process.env.NODE_ENV,
  DATABASE_URL: process.env.DATABASE_URL,
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
  BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
  APP_TIME_ZONE: process.env.APP_TIME_ZONE,
});
