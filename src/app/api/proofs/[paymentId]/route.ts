import { services } from "@/server/container";
import { fileResponse, respond } from "@/server/http/responses";
import { routeActor } from "@/server/http/route-auth";

const TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  pdf: "application/pdf",
};

/** Streams a proof file after checking the viewer may see this payment (private bucket). */
export async function GET(_request: Request, { params }: RouteContext<"/api/proofs/[paymentId]">) {
  return respond(async () => {
    const { paymentId } = await params;
    const file = await services().records.proofFile(await routeActor(), paymentId);
    if (!file) return new Response("No proof on file.", { status: 404 });
    const ext = file.key.split(".").pop() ?? "";
    const type = TYPES[ext] ?? "application/octet-stream";
    // Images open in the browser (sandboxed); PDFs and anything else download instead of rendering on our origin.
    return fileResponse(file.bytes, `proof-${paymentId}.${ext}`, type, type.startsWith("image/"));
  });
}
