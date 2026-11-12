import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import type { Actor } from "@/domain/actor";
import { UnauthenticatedError } from "@/domain/errors";
import { services } from "@/server/container";
import { sessionToken } from "@/server/auth/session";
import { env } from "@/lib/env";

/** Actor for route handlers (downloads). Throws instead of redirecting. */
export async function routeActor(): Promise<Actor> {
  const token = await sessionToken();
  const session = token ? await services().auth.resolveActor(token) : null;
  if (!session || session.user.mustChangePassword) throw new UnauthenticatedError();
  return session.actor;
}

/** Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`. Compared in constant time. */
export function isCronRequest(request: Request): boolean {
  const secret = env().CRON_SECRET;
  if (!secret) return false;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(request.headers.get("authorization") ?? ""), digest(`Bearer ${secret}`));
}
