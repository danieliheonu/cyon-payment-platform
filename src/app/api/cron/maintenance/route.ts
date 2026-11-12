import { services } from "@/server/container";
import { respond } from "@/server/http/responses";
import { isCronRequest } from "@/server/http/route-auth";
import { RATE_LIMIT_RETENTION_MS } from "@/server/services/rate-limiter";

/** Daily: remove expired sessions and old rate-limit counters. */
export async function GET(request: Request) {
  if (!isCronRequest(request)) return new Response("Unauthorized", { status: 401 });
  return respond(async () => Response.json(await services().auth.purgeExpired(RATE_LIMIT_RETENTION_MS)));
}
