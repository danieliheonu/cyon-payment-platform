import type { Metadata } from "next";
import { LABELS, Role } from "@/domain/enums";
import { GRANTABLE_ROLES, Permission, isGrantActive } from "@/domain/permissions";
import { formatDateTime, toLagosDateOnly } from "@/lib/dates";
import { Alert, Badge, Card, DataTable, PageHeader, Pagination } from "@/components/ui";
import { paginate } from "@/lib/pagination";
import { pageFromParams } from "@/lib/validation/query";
import { services } from "@/server/container";
import { requirePermission } from "@/server/auth/session";
import { GrantForm, RevokeForm } from "./access-forms";

export const metadata: Metadata = { title: "Finance access" };

/**
 * Only the Financial Officer changes financial records by default. The Super Admin can
 * grant an admin (or themself) one or more finance areas, optionally until a date.
 */
export default async function AccessPage({ searchParams }: PageProps<"/admin/access">) {
  const actor = await requirePermission(Permission.MANAGE_GRANTS);
  const params = await searchParams;
  const [admins, grants] = await Promise.all([
    services().access.listUsers(actor, { roles: [...GRANTABLE_ROLES] }),
    services().access.listGrants(actor),
  ]);
  const now = new Date();
  // Two tables on one page, each with its own page number in the URL.
  const active = paginate(grants.filter((g) => isGrantActive(g, now)), pageFromParams(params, 25, "activePage"));
  const history = paginate(grants.filter((g) => !isGrantActive(g, now)), pageFromParams(params, 25, "historyPage"));
  const keep = (...keys: string[]) => new URLSearchParams(keys.flatMap((k) => (typeof params[k] === "string" ? [[k, params[k]]] : [])));
  const userOptions = admins
    .filter((u) => u.isActive)
    .map((u) => ({ value: u.id, label: `${u.name} — ${LABELS.role[u.role]}${u.id === actor.userId ? " (you)" : ""}` }));

  return (
    <>
      <PageHeader
        title="Finance access"
        description="The Financial Officer can change financial records. Other admins — including you — can only do so in the areas granted here. Every grant and revoke is kept in the audit log."
      />
      <div className="mb-6">
        <Alert tone="info">
          Granting yourself an area is allowed but is recorded as a self-grant. Changing someone&apos;s role to Member or Financial Officer revokes their grants.
        </Alert>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <Card title="Active grants">
            <DataTable
              rows={active.rows}
              rowKey={(g) => g.id}
              empty="No admin has finance access. Only the Financial Officer can change financial records."
              columns={[
                { header: "Admin", cell: (g) => <span className="font-medium">{g.userName}</span> },
                { header: "Area", cell: (g) => LABELS.financeArea[g.area] },
                {
                  header: "Granted",
                  cell: (g) => (
                    <div className="text-xs">
                      <p>{formatDateTime(g.grantedAt)} by {g.grantedByName}{g.grantedById === g.userId ? " (self)" : ""}</p>
                      <p className="text-muted">{g.reason}</p>
                    </div>
                  ),
                },
                { header: "Expires", cell: (g) => (g.expiresAt ? formatDateTime(g.expiresAt) : "Until revoked") },
                { header: "", cell: (g) => <RevokeForm grantId={g.id} /> },
              ]}
            />
            <Pagination page={active.page} pageSize={active.pageSize} total={active.total} params={keep("historyPage", "historyPageSize")} pageKey="activePage" />
          </Card>
          <Card title="History">
            <DataTable
              rows={history.rows}
              rowKey={(g) => g.id}
              empty="No past grants."
              columns={[
                { header: "Admin", cell: (g) => g.userName },
                { header: "Area", cell: (g) => LABELS.financeArea[g.area] },
                { header: "Granted", cell: (g) => <span className="text-xs">{formatDateTime(g.grantedAt)} by {g.grantedByName}</span> },
                {
                  header: "Ended",
                  cell: (g) =>
                    g.revokedAt ? (
                      <div className="text-xs">
                        <Badge>Revoked</Badge> {formatDateTime(g.revokedAt)} by {g.revokedByName}
                        <p className="text-muted">{g.revokeReason}</p>
                      </div>
                    ) : (
                      <span className="text-xs"><Badge>Expired</Badge> {g.expiresAt ? formatDateTime(g.expiresAt) : ""}</span>
                    ),
                },
              ]}
            />
            <Pagination page={history.page} pageSize={history.pageSize} total={history.total} params={keep("activePage", "activePageSize")} pageKey="historyPage" />
          </Card>
        </div>
        <Card title="Grant access">
          {userOptions.length ? (
            <GrantForm users={userOptions} minDate={toLagosDateOnly()} />
          ) : (
            <p className="text-sm text-muted">Create an Admin account on Users &amp; roles first.</p>
          )}
          <p className="mt-3 text-xs text-muted">Grants apply to {GRANTABLE_ROLES.map((r) => LABELS.role[r as Role]).join(" and ")} accounts.</p>
        </Card>
      </div>
    </>
  );
}
