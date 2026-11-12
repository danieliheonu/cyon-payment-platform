import { services } from "@/server/container";
import { fileResponse, respond } from "@/server/http/responses";

/** Guest payers download their receipt with the private token from their status link. */
export async function GET(_request: Request, { params }: RouteContext<"/api/guest-receipts/[token]">) {
  return respond(async () => {
    const { token } = await params;
    const result = await services().records.guestReceiptPdf(token);
    if (!result) return new Response("Receipt not available.", { status: 404 });
    return fileResponse(result.pdf, `${result.receipt.receiptNo}.pdf`, "application/pdf");
  });
}
