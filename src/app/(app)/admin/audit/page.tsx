import type { Metadata } from "next";
import Link from "next/link";
import { Permission } from "@/domain/permissions";
import { formatDateTime } from "@/lib/dates";
import { pageFromParams, param } from "@/lib/validation/query";
import { FilterBar } from "@/components/filter-bar";
import { DataTable, PageHeader, Pagination } from "@/components/ui";
import { services } from "@/server/container";
import { requirePermission } from "@/server/auth/session";

export const metadata: Metadata = { title: "Audit log" };

const ENTITIES = ["Payment", "Member", "User", "PermissionGrant", "PaymentCategory", "CategoryRate", "FinancialYear", "Obligation", "BankAccount", "PaymentLink"];

/** Pretty-prints a before/after snapshot, small enough to read inline. */
function Snapshot({ label, value }: { label: string; value: unknown }) {
  if (value === null || value === undefined) return null;
  return (
    <details className="text-xs">
      <summary className="cursor-pointer text-muted">{label}</summary>
      <pre className="mt-1 max-h-64 max-w-md overflow-auto rounded bg-surface-muted p-2">{JSON.stringify(value, null, 2)}</pre>
    </details>
  );
}

function entityHref(entity: string, id: string): string | null {
  if (entity === "Payment") return `/payments/${id}`;
  if (entity === "Member") return `/staff/members/${id}`;
  if (entity === "PaymentLink") return `/staff/payment-links/${id}`;
  return null;
}

export default async function AuditPage({ searchParams }: PageProps<"/admin/audit">) {
  const actor = await requirePermission(Permission.VIEW_AUDIT);
  const params = await searchParams;
  const filter = { entity: param(params, "entity"), entityId: param(params, "entityId") };
  const result = await services().records.auditLog(actor, filter, pageFromParams(params, 50));
  const pageParams = new URLSearchParams(Object.entries(filter).filter((e): e is [string, string] => Boolean(e[1])));

  return (
    <>
      <PageHeader title="Audit log" description="Every change to records, rates, access and settings — who did it, when, and the values before and after." />
      <FilterBar
        keep={{ pageSize: param(params, "pageSize") }}
        fields={[
          { kind: "select", name: "entity", label: "Record type", options: ENTITIES.map((e) => ({ value: e, label: e })) },
          { kind: "search", name: "entityId", label: "Record id" },
        ]}
        values={filter}
      />
      <DataTable
        rows={result.rows}
        rowKey={(a) => a.id}
        empty="Nothing recorded yet."
        columns={[
          { header: "When", cell: (a) => <span className="whitespace-nowrap text-xs">{formatDateTime(a.createdAt)}</span> },
          { header: "Who", cell: (a) => a.actorName ?? "System" },
          { header: "Action", cell: (a) => <code className="text-xs">{a.action}</code> },
          {
            header: "Record",
            cell: (a) => {
              const href = entityHref(a.entity, a.entityId);
              return href ? <Link className="text-brand hover:underline" href={href}>{a.entity}</Link> : a.entity;
            },
          },
          {
            header: "Details",
            cell: (a) => (
              <div className="space-y-1">
                {a.reason ? <p className="text-xs">{a.reason}</p> : null}
                <Snapshot label="Before" value={a.before} />
                <Snapshot label="After" value={a.after} />
              </div>
            ),
          },
        ]}
      />
      <Pagination page={result.page} pageSize={result.pageSize} total={result.total} params={pageParams} />
    </>
  );
}
