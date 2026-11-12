import { Suspense, type ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { requireActor } from "@/server/auth/session";
import { env } from "@/lib/env";

/** Signed-in area. The session is read per request inside Suspense (Cache Components). */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-muted">Loading…</div>}>
      <Shell>{children}</Shell>
    </Suspense>
  );
}

async function Shell({ children }: { children: ReactNode }) {
  const actor = await requireActor();
  return (
    <AppShell actor={actor} orgName={env().ORG_NAME}>
      {children}
    </AppShell>
  );
}
