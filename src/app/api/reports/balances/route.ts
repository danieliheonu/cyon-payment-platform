import { param } from "@/lib/validation/query";
import { toLagosDateOnly } from "@/lib/dates";
import { services } from "@/server/container";
import { fileResponse, respond } from "@/server/http/responses";
import { routeActor } from "@/server/http/route-auth";

export async function GET(request: Request) {
  return respond(async () => {
    const params = Object.fromEntries(new URL(request.url).searchParams);
    const year = Number(param(params, "year")) || undefined;
    const csv = await services().reports.balancesCsv(await routeActor(), { year, categoryId: param(params, "categoryId") });
    return fileResponse(csv, `cyon-balances-${year ?? "all"}-${toLagosDateOnly()}.csv`, "text/csv; charset=utf-8");
  });
}
