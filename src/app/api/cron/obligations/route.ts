import { services } from "@/server/container";
import { respond } from "@/server/http/responses";
import { isCronRequest } from "@/server/http/route-auth";

/** Daily: creates any dues that have fallen due (idempotent). */
export async function GET(request: Request) {
  if (!isCronRequest(request)) return new Response("Unauthorized", { status: 401 });
  return respond(async () => Response.json({ created: await services().obligations.generateDue() }));
}
