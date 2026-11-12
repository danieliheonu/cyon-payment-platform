import "dotenv/config";

// Integration tests use a separate database so they never touch development data.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:54329/cyon_test";
process.env.CRON_SECRET ??= "test-cron-secret";
