"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavSection } from "./navigation";
import { cx } from "./ui";

export function NavLinks({ sections }: { sections: NavSection[] }) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || (href !== "/staff" && pathname.startsWith(`${href}/`));
  return (
    <nav className="space-y-5 pt-3" aria-label="Main">
      {sections.map((section) => (
        <div key={section.title}>
          <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wider text-muted">{section.title}</p>
          <ul className="space-y-0.5">
            {section.items.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={isActive(item.href) ? "page" : undefined}
                  className={cx(
                    "block rounded-md px-3 py-1.5 text-sm",
                    isActive(item.href) ? "bg-brand-soft font-medium text-brand-strong" : "text-foreground hover:bg-surface-muted",
                  )}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
