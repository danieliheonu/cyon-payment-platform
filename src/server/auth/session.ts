import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { forbidden, redirect } from "next/navigation";
import { can, type Actor } from "@/domain/actor";
import { isStaffRole, type Permission } from "@/domain/permissions";
import { services } from "@/server/container";

export const SESSION_COOKIE = "cyon_session";
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // the server-side session (14 days, sliding) is what actually expires

export async function setSessionCookie(token: string): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function sessionToken(): Promise<string | null> {
  return (await cookies()).get(SESSION_COOKIE)?.value ?? null;
}

/**
 * The signed-in actor with fresh permissions, memoized per request render.
 * Never cached across requests: it checks expiry, renews the sliding session and
 * re-reads finance grants, so a revoked grant stops working on the next request.
 */
export const currentSession = cache(async () => {
  const token = await sessionToken();
  if (!token) return null;
  await connection();
  return services().auth.resolveActor(token);
});

export async function currentActor(): Promise<Actor | null> {
  return (await currentSession())?.actor ?? null;
}

/** Redirects to /login when signed out, and to /change-password when a temporary password is in use. */
export async function requireActor(options: { allowPasswordChange?: boolean } = {}): Promise<Actor> {
  const session = await currentSession();
  if (!session) redirect("/login");
  if (session.user.mustChangePassword && !options.allowPasswordChange) redirect("/change-password");
  return session.actor;
}

export async function requirePermission(permission: Permission): Promise<Actor> {
  const actor = await requireActor();
  if (!can(actor, permission)) forbidden();
  return actor;
}

export async function requireStaff(): Promise<Actor> {
  const actor = await requireActor();
  if (!isStaffRole(actor.role)) forbidden();
  return actor;
}

export function homePathFor(actor: Actor): string {
  return isStaffRole(actor.role) ? "/staff" : "/dashboard";
}
