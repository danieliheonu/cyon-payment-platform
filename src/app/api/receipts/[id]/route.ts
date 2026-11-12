import { services } from "@/server/container";
import { fileResponse, respond } from "@/server/http/responses";
import { routeActor } from "@/server/http/route-auth";

export async function GET(_request: Request, { params }: RouteContext<"/api/receipts/[id]">) {
  return respond(async () => {
    const { id } = await params;
    const { receipt, pdf } = await services().records.receiptPdf(await routeActor(), id);
    return fileResponse(pdf, `${receipt.receiptNo}.pdf`, "application/pdf");
  });
}
