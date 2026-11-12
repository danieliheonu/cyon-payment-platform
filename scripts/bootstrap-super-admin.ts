/**
 * Creates the first Super Admin from environment variables:
 *   SUPER_ADMIN_NAME, SUPER_ADMIN_EMAIL and/or SUPER_ADMIN_PHONE, SUPER_ADMIN_PASSWORD
 *
 *   npm run db:bootstrap      (also runs in `vercel-build`, after migrations)
 *
 * Does nothing once an active Super Admin exists, so it is safe on every deploy and
 * later edits to these variables never change an existing account.
 */
import { bootstrapAdminSchema } from "@/lib/validation/schemas";
import { services } from "@/server/container";
import { fail, parseOrExit, run } from "./cli";

run(async () => {
  const { access } = services();
  if (await access.hasActiveSuperAdmin()) {
    console.log("Super Admin already exists: SUPER_ADMIN_* variables ignored.");
    return;
  }

  const { SUPER_ADMIN_NAME, SUPER_ADMIN_EMAIL, SUPER_ADMIN_PHONE, SUPER_ADMIN_PASSWORD } = process.env;
  if (!SUPER_ADMIN_PASSWORD) {
    fail("No Super Admin exists yet. Set SUPER_ADMIN_NAME, SUPER_ADMIN_EMAIL and/or SUPER_ADMIN_PHONE, and SUPER_ADMIN_PASSWORD.");
  }
  const input = parseOrExit(bootstrapAdminSchema, {
    name: SUPER_ADMIN_NAME ?? "",
    email: SUPER_ADMIN_EMAIL ?? "",
    phone: SUPER_ADMIN_PHONE ?? "",
    password: SUPER_ADMIN_PASSWORD,
  });
  const user = await access.bootstrapSuperAdmin(input);
  console.log(
    `✓ Super Admin created: ${user.name} (${user.email ?? user.phone}). ` +
      "They must choose a new password at first sign-in; SUPER_ADMIN_PASSWORD can then be removed.",
  );
});
