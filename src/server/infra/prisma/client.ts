import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

/**
 * One PrismaClient per process and connection string, reused across hot reloads in
 * development. If DATABASE_URL changes (e.g. `.env` edited while `next dev` runs), a new
 * client is created for the new address instead of reusing the stale one.
 */
const globalForPrisma = globalThis as unknown as { prismaByUrl?: { url: string; client: PrismaClient } };

export function prismaClient(connectionString = process.env.DATABASE_URL): PrismaClient {
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  const cached = globalForPrisma.prismaByUrl;
  if (cached?.url === connectionString) return cached.client;

  if (cached) void cached.client.$disconnect().catch(() => undefined);
  const client = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  globalForPrisma.prismaByUrl = { url: connectionString, client };
  return client;
}
