import type { NextConfig } from "next";
import { withBotId } from "botid/next/config";

const isDev = process.env.NODE_ENV !== "production";

/**
 * Content Security Policy. Everything (including Vercel BotID, which is proxied
 * through same-origin rewrites) loads from this site. Next.js injects inline
 * bootstrap scripts, hence 'unsafe-inline' for scripts; a nonce-based policy would
 * force every page to render dynamically. The other directives still block plugins,
 * <base> hijacking, form posts to other sites and framing (clickjacking).
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Guest status links carry a private token in the path: never send it to other sites.
  { key: "Referrer-Policy", value: "same-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
];

/**
 * VS Code port forwarding (dev tunnels) serves the app at *.devtunnels.ms but rewrites
 * the browser's Origin header to localhost:3000, which fails the Server Actions CSRF
 * check (Origin vs x-forwarded-host). Allow both in development only; production keeps
 * the strict same-origin check.
 */
const devTunnelHosts = ["**.devtunnels.ms"];

const nextConfig: NextConfig = {
  // The E2E server builds into its own folder so it can run alongside `next dev`.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  allowedDevOrigins: devTunnelHosts,
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  experimental: {
    // Enables forbidden() / unauthorized() for role-based access pages.
    authInterrupts: true,
    serverActions: {
      // Proof-of-payment uploads are capped at 4 MB (see src/lib/validation/proof.ts) + multipart overhead.
      bodySizeLimit: "4.2mb",
      ...(isDev ? { allowedOrigins: ["localhost:3000", ...devTunnelHosts] } : {}),
    },
  },
  serverExternalPackages: ["@react-pdf/renderer"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default withBotId(nextConfig);
