import "dotenv/config";
import { defineConfig } from "prisma/config";

// Prisma CLI config. Migrations live in prisma/migrations/ and are the only way
// the database schema changes. The CLI uses DIRECT_URL (non-pooled) because
// migrations cannot run through Supabase's transaction pooler.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx --tsconfig scripts/tsconfig.json prisma/seed.ts",
  },
  datasource: {
    url: process.env["DIRECT_URL"] ?? process.env["DATABASE_URL"],
    // Scratch database that `db:check` (and `migrate dev`) replays migrations into. Its contents are wiped.
    shadowDatabaseUrl: process.env["SHADOW_DATABASE_URL"],
  },
});
