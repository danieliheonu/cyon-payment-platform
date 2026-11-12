import "server-only";
import { unstable_rethrow } from "next/navigation";
import { DomainError } from "@/domain/errors";

const STATUS: Record<DomainError["code"], number> = {
  VALIDATION: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RULE: 422,
  RATE_LIMITED: 429,
};

/** Maps domain errors to HTTP responses for route handlers (downloads, cron). */
export async function respond(run: () => Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (error) {
    unstable_rethrow(error); // let Next.js control flow (prerender bail-out, redirects) through
    if (error instanceof DomainError) return new Response(error.message, { status: STATUS[error.code] });
    console.error(error);
    return new Response("Something went wrong.", { status: 500 });
  }
}

export function fileResponse(body: Uint8Array | string, filename: string, contentType: string, inline = false): Response {
  return new Response(typeof body === "string" ? body : Buffer.from(body), {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${filename.replace(/[^\w.-]/g, "_")}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      // Files are data, never pages: no scripts, no plugins, no access to the app origin.
      "Content-Security-Policy": "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox",
    },
  });
}
