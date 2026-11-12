const BASE = "http://same-origin.invalid";

/**
 * Returns a same-site path to redirect to after sign-in, or null.
 * Resolving with the URL parser (as browsers do) rejects tricks like `/\evil.com`
 * or `//evil.com`, which browsers treat as other sites.
 */
export function safeRedirectPath(next: unknown): string | null {
  if (typeof next !== "string" || !next.startsWith("/")) return null;
  let url: URL;
  try {
    url = new URL(next, BASE);
  } catch {
    return null;
  }
  if (url.origin !== BASE) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}
