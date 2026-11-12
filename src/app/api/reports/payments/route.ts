import { paymentQueryFromParams } from "@/lib/validation/query";
import { toLagosDateOnly } from "@/lib/dates";
import { services } from "@/server/container";
import { fileResponse, respond } from "@/server/http/responses";
import { routeActor } from "@/server/http/route-auth";

/** CSV of payments using the same filters as the on-screen list. */
export async function GET(request: Request) {
  return respond(async () => {
    const params = Object.fromEntries(new URL(request.url).searchParams);
    const csv = await services().reports.paymentsCsv(await routeActor(), paymentQueryFromParams(params));
    return fileResponse(csv, `cyon-payments-${toLagosDateOnly()}.csv`, "text/csv; charset=utf-8");
  });
}
