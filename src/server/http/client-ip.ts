import "server-only";
import { headers } from "next/headers";

/**
 * The caller's IP address for rate limiting. On Vercel these headers are set by the
 * platform (client-supplied values are overwritten). Returns null when unknown.
 */
export async function clientIp(): Promise<string | null> {
  const h = await headers();
  const ip = h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0];
  return ip?.trim() || null;
}
