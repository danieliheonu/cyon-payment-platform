import Link from "next/link";
import type { ReactNode } from "react";
import type { Actor } from "@/domain/actor";
import { LABELS } from "@/domain/enums";
import { logoutAction } from "@/app/actions/auth";
import { navigationFor } from "./navigation";
import { NavLinks } from "./nav-links";

export function AppShell({ actor, orgName, children }: { actor: Actor; orgName: string; children: ReactNode }) {
  const sections = navigationFor(actor);
  const nav = <NavLinks sections={sections} />;
  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <aside className="hidden w-64 shrink-0 border-r border-border bg-surface lg:flex lg:flex-col">
        <Brand orgName={orgName} />
        <div className="flex-1 overflow-y-auto px-3 pb-6">{nav}</div>
        <UserBox actor={actor} />
      </aside>

      <header className="sticky top-0 z-10 border-b border-border bg-surface lg:hidden">
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3">
            <span className="font-semibold text-brand">{orgName} Payments</span>
            <span className="text-sm text-muted group-open:hidden">Menu</span>
            <span className="hidden text-sm text-muted group-open:inline">Close</span>
          </summary>
          <div className="max-h-[70vh] overflow-y-auto border-t border-border px-3 pb-4">
            {nav}
            <UserBox actor={actor} />
          </div>
        </details>
      </header>

      <main className="min-w-0 flex-1 px-4 py-6 sm:px-8 lg:py-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}

function Brand({ orgName }: { orgName: string }) {
  return (
    <Link href="/" className="block px-6 py-5">
      <span className="block text-lg font-semibold text-brand">{orgName}</span>
      <span className="text-xs uppercase tracking-wider text-muted">Payment system</span>
    </Link>
  );
}

function UserBox({ actor }: { actor: Actor }) {
  return (
    <div className="border-t border-border px-6 py-4 text-sm">
      <p className="font-medium">{actor.displayName}</p>
      <p className="text-xs text-muted">{LABELS.role[actor.role]}</p>
      <div className="mt-3 flex gap-3">
        <Link href="/change-password" className="text-brand hover:underline">
          Password
        </Link>
        <form action={logoutAction}>
          <button type="submit" className="text-brand hover:underline">
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
