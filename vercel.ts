import type { VercelConfig } from "@vercel/config/v1";

/**
 * Vercel project configuration.
 * - Builds apply pending migrations from prisma/migrations before building (see `vercel-build`).
 * - Crons call routes protected by CRON_SECRET (Vercel sends it as a Bearer token).
 */
export const config: VercelConfig = {
  framework: "nextjs",
  buildCommand: "npm run vercel-build",
  crons: [
    // Daily 01:00 WAT: create any newly due monthly/quarterly/yearly dues.
    { path: "/api/cron/obligations", schedule: "0 0 * * *" },
    // Weekly, Sunday 03:00 WAT: CSV export of all payment records to the private backups bucket.
    { path: "/api/cron/backup", schedule: "0 2 * * 0" },
    // Daily 04:00 WAT: purge expired sessions and old rate-limit counters.
    { path: "/api/cron/maintenance", schedule: "0 3 * * *" },
  ],
};
