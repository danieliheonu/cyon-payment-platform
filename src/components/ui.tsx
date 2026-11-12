import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { LABELS, type PaymentStatus } from "@/domain/enums";
import { formatNaira, type Kobo } from "@/domain/money";
import { PAGE_SIZES, pageSizeKey } from "@/lib/pagination";
import { PageSizeSelect } from "./page-size-select";

/** Small, dependency-free UI kit shared by every page. */

export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

const buttonStyles = {
  primary: "bg-brand text-white hover:bg-brand-strong",
  secondary: "border border-border bg-surface text-foreground hover:bg-surface-muted",
  danger: "bg-danger text-white hover:opacity-90",
  ghost: "text-brand hover:bg-brand-soft",
} as const;

export type ButtonVariant = keyof typeof buttonStyles;

export function buttonClass(variant: ButtonVariant = "primary", size: "sm" | "md" = "md"): string {
  return cx(
    "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60",
    size === "sm" ? "px-2.5 py-1.5 text-sm" : "px-4 py-2 text-sm",
    buttonStyles[variant],
  );
}

export function Button({ variant = "primary", size = "md", className, ...props }: ComponentProps<"button"> & { variant?: ButtonVariant; size?: "sm" | "md" }) {
  return <button className={cx(buttonClass(variant, size), className)} {...props} />;
}

export function LinkButton({ variant = "primary", size = "md", className, ...props }: ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: "sm" | "md" }) {
  return <Link className={cx(buttonClass(variant, size), className)} {...props} />;
}

export const inputClass =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 aria-[invalid=true]:border-danger";

/** "← Back to …" link to the parent page, shown above a page title. */
export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="mb-2 inline-flex items-center gap-1 rounded text-sm text-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40">
      <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="m15 18-6-6 6-6" />
      </svg>
      {label}
    </Link>
  );
}

export function PageHeader({ title, description, actions, back }: { title: string; description?: ReactNode; actions?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {back ? <BackLink {...back} /> : null}
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function Card({ title, description, actions, children, className }: { title?: string; description?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("rounded-lg border border-border bg-surface p-5", className)}>
      {title ? (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">{title}</h2>
            {description ? <p className="mt-0.5 text-sm text-muted">{description}</p> : null}
          </div>
          {actions}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Stat({ label, value, hint, tone = "default" }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "default" | "brand" | "warning" }) {
  return (
    <div className={cx("rounded-lg border border-border p-4", tone === "brand" ? "bg-brand-soft" : tone === "warning" ? "bg-warning-soft" : "bg-surface")}>
      <p className="text-sm text-muted">{label}</p>
      <p className="tabular mt-1 text-xl font-semibold">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

export function Money({ kobo, className }: { kobo: Kobo; className?: string }) {
  return <span className={cx("tabular whitespace-nowrap", className)}>{formatNaira(kobo)}</span>;
}

const statusTone: Record<PaymentStatus, string> = {
  PENDING: "bg-warning-soft text-warning",
  CONFIRMED: "bg-success-soft text-success",
  REJECTED: "bg-danger-soft text-danger",
  VOIDED: "bg-surface-muted text-muted",
};

export function StatusBadge({ status }: { status: PaymentStatus }) {
  return <Badge className={statusTone[status]}>{LABELS.paymentStatus[status]}</Badge>;
}

export function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", className ?? "bg-surface-muted text-muted")}>{children}</span>;
}

export function Alert({ tone = "info", title, children }: { tone?: "info" | "warning" | "danger" | "success"; title?: string; children: ReactNode }) {
  const tones = {
    info: "border-brand/30 bg-brand-soft",
    warning: "border-warning/30 bg-warning-soft",
    danger: "border-danger/30 bg-danger-soft",
    success: "border-success/30 bg-success-soft",
  };
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cx("rounded-md border px-4 py-3 text-sm", tones[tone])}>
      {title ? <p className="font-semibold">{title}</p> : null}
      <div className={title ? "mt-1" : undefined}>{children}</div>
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-muted">{children}</p>;
}

export interface Column<T> {
  header: string;
  cell: (row: T) => ReactNode;
  align?: "left" | "right";
  className?: string;
}

/** One table component for every list in the app. */
export function DataTable<T>({ columns, rows, rowKey, empty = "Nothing to show yet." }: { columns: Column<T>[]; rows: T[]; rowKey: (row: T) => string; empty?: ReactNode }) {
  if (rows.length === 0) return <EmptyState>{empty}</EmptyState>;
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface">
      <table className="w-full text-sm">
        <thead className="bg-surface-muted text-left text-xs uppercase tracking-wide text-muted">
          <tr>
            {columns.map((c) => (
              <th key={c.header} scope="col" className={cx("px-3 py-2.5 font-medium", c.align === "right" && "text-right", c.className)}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => (
            <tr key={rowKey(row)} className="hover:bg-surface-muted/60">
              {columns.map((c) => (
                <td key={c.header} className={cx("px-3 py-2.5 align-top", c.align === "right" && "text-right", c.className)}>
                  {c.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Previous/next links that keep the current filters. */
/**
 * Rows-per-page choice + previous/next links. `params` keeps the page's filters;
 * `pageKey` matches `pageFromParams(…, key)`. Hidden when every row fits on the smallest page.
 */
export function Pagination({ page, pageSize, total, params, pageKey = "page" }: { page: number; pageSize: number; total: number; params: URLSearchParams; pageKey?: string }) {
  if (total <= PAGE_SIZES[0]) return null;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const href = (p: number) => {
    const next = new URLSearchParams(params);
    next.set(pageKey, String(p));
    next.set(pageSizeKey(pageKey), String(pageSize));
    return `?${next.toString()}`;
  };
  return (
    <nav className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm" aria-label="Pagination">
      <span className="text-muted">
        Page {page} of {pages} · {total} records
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <PageSizeSelect value={pageSize} params={params.toString()} pageKey={pageKey} />
        {page > 1 ? <LinkButton variant="secondary" size="sm" href={href(page - 1)}>Previous</LinkButton> : null}
        {page < pages ? <LinkButton variant="secondary" size="sm" href={href(page + 1)}>Next</LinkButton> : null}
      </div>
    </nav>
  );
}

/** Definition list for detail pages. */
export function Details({ items }: { items: Array<[string, ReactNode]> }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[max-content_1fr]">
      {items.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted">{label}</dt>
          <dd className="font-medium">{value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
