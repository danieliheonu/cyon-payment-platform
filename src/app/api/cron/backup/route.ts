import { services } from "@/server/container";
import { respond } from "@/server/http/responses";
import { isCronRequest } from "@/server/http/route-auth";

/** Weekly: CSV export of all payment records to the private backups bucket. */
export async function GET(request: Request) {
  if (!isCronRequest(request)) return new Response("Unauthorized", { status: 401 });
  return respond(async () => Response.json({ files: await services().backups.run() }));
}
