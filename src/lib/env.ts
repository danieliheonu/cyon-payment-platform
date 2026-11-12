import "server-only";
import { z } from "zod";
import { password } from "@/lib/validation/fields";

/** Validated server environment. Imported only by the composition root and infra adapters. */
const schema = z.object({
  DATABASE_URL: z.string().min(1),
  SUPABASE_URL: z.string().optional().default(""),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional().default(""),
  SUPABASE_PROOFS_BUCKET: z.string().default("payment-proofs"),
  SUPABASE_BACKUPS_BUCKET: z.string().default("backups"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  ORG_NAME: z.string().default("CYON"),
  CRON_SECRET: z.string().optional().default(""),
  /** Password every new member login starts with; members must change it at first sign-in. */
  MEMBER_DEFAULT_PASSWORD: z.preprocess((v) => (v === "" ? undefined : v), password.optional()),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  cached ??= schema.parse(process.env);
  return cached;
}

/** Supabase Storage is used when configured; otherwise files go to a local folder (development only). */
export function supabaseStorageConfigured(e: Env = env()): boolean {
  return Boolean(e.SUPABASE_URL && e.SUPABASE_SERVICE_ROLE_KEY);
}
