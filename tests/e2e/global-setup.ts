import { execSync } from "node:child_process";
import { Client } from "pg";
import { E2E_DATABASE_URL, E2E_MEMBER_DEFAULT_PASSWORD } from "../../playwright.config";

/** Recreates the dedicated E2E database, applies every migration, then seeds it. */
export default async function globalSetup() {
  const url = new URL(E2E_DATABASE_URL);
  const name = url.pathname.slice(1);
  if (!name.endsWith("_e2e")) throw new Error(`Refusing to recreate "${name}": E2E databases must end in _e2e.`);
  const admin = new Client({ connectionString: Object.assign(new URL(url), { pathname: "/postgres" }).toString() });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await admin.query(`CREATE DATABASE "${name}"`);
  await admin.end();

  const env = { ...process.env, DATABASE_URL: E2E_DATABASE_URL, DIRECT_URL: E2E_DATABASE_URL, MEMBER_DEFAULT_PASSWORD: E2E_MEMBER_DEFAULT_PASSWORD };
  execSync("npx prisma migrate deploy", { env, stdio: "pipe" });
  execSync("npx tsx --tsconfig scripts/tsconfig.json prisma/seed.ts", { env, stdio: "pipe" });
}
