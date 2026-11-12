import { Suspense, type ReactNode } from "react";

/** Public payment-link pages: no login, no app navigation. */
export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl px-4 py-8 sm:py-12">
      <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>{children}</Suspense>
    </main>
  );
}
