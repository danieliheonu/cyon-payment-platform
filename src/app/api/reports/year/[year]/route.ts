import { services } from "@/server/container";
import { fileResponse, respond } from "@/server/http/responses";
import { routeActor } from "@/server/http/route-auth";

/** Yearly financial summary as CSV (default) or PDF (?format=pdf). Staff only. */
export async function GET(request: Request, { params }: RouteContext<"/api/reports/year/[year]">) {
  return respond(async () => {
    const year = Number((await params).year);
    if (!Number.isInteger(year)) return new Response("Invalid year", { status: 400 });
    const actor = await routeActor();
    if (new URL(request.url).searchParams.get("format") === "pdf") {
      return fileResponse(await services().reports.yearSummaryPdf(actor, year), `cyon-financial-summary-${year}.pdf`, "application/pdf");
    }
    return fileResponse(await services().reports.yearSummaryCsv(actor, year), `cyon-financial-summary-${year}.csv`, "text/csv; charset=utf-8");
  });
}
