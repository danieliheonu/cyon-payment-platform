import type { Metadata } from "next";
import { LABELS, Role } from "@/domain/enums";
import { Permission, STAFF_ROLES } from "@/domain/permissions";
import { formatDateTime } from "@/lib/dates";
import { paginate } from "@/lib/pagination";
import { pageFromParams, param } from "@/lib/validation/query";
import { FilterBar } from "@/components/filter-bar";
import { Badge, Card, PageHeader, Pagination } from "@/components/ui";
import { services } from "@/server/container";
import { requirePermission } from "@/server/auth/session";
import { ChangeRoleForm, ResetPasswordForm, SetActiveForm, StaffUserForm } from "./user-forms";

export const metadata: Metadata = { title: "Users & roles" };

const STAFF_ROLE_OPTIONS = STAFF_ROLES.map((r) => ({ value: r, label: LABELS.role[r] }));
const ALL_ROLE_OPTIONS = Object.values(Role).map((r) => ({ value: r, label: LABELS.role[r] }));

export default async function UsersPage({ searchParams }: PageProps<"/admin/users">) {
  const actor = await requirePermission(Permission.MANAGE_USERS);
  const params = await searchParams;
  const search = param(params, "q");
  const roleParam = param(params, "role");
  const role = roleParam && roleParam in Role ? (roleParam as Role) : undefined;
  const users = paginate(await services().access.listUsers(actor, { search, roles: role ? [role] : [...STAFF_ROLES] }), pageFromParams(params));
  const pageParams = new URLSearchParams({ ...(search ? { q: search } : {}), ...(role ? { role } : {}) });

  return (
    <>
      <PageHeader
        title="Users & roles"
        description="Staff accounts and roles. Finance access for admins is granted separately on Finance access. The last active Super Admin can't be removed."
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-4">
          <FilterBar
            keep={{ pageSize: param(params, "pageSize") }}
            fields={[
              { kind: "search", name: "q", label: "Search", placeholder: "Name, email or phone" },
              { kind: "select", name: "role", label: "Role", options: ALL_ROLE_OPTIONS, allLabel: "All staff" },
            ]}
            values={{ q: search, role }}
          />
          {users.total ? null : <p className="text-sm text-muted">No accounts match.</p>}
          {users.rows.map((u) => (
            <details key={u.id} className="rounded-lg border border-border bg-surface">
              <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-4 py-3">
                <span className="font-medium">{u.name}</span>
                <Badge>{LABELS.role[u.role]}</Badge>
                {u.isActive ? null : <Badge className="bg-danger-soft text-danger">Deactivated</Badge>}
                {u.id === actor.userId ? <Badge>You</Badge> : null}
                <span className="ml-auto text-xs text-muted">{[u.email, u.phone].filter(Boolean).join(" · ")}</span>
              </summary>
              <div className="grid gap-6 border-t border-border p-4 md:grid-cols-3">
                <ChangeRoleForm userId={u.id} role={u.role} roles={u.role === Role.MEMBER ? ALL_ROLE_OPTIONS : STAFF_ROLE_OPTIONS} />
                <SetActiveForm userId={u.id} isActive={u.isActive} />
                <div className="space-y-2">
                  <ResetPasswordForm userId={u.id} />
                  <p className="text-xs text-muted">
                    Created {formatDateTime(u.createdAt)} · Last sign-in {u.lastLoginAt ? formatDateTime(u.lastLoginAt) : "never"}
                  </p>
                </div>
              </div>
            </details>
          ))}
          <Pagination page={users.page} pageSize={users.pageSize} total={users.total} params={pageParams} />
        </div>
        <Card title="Add a staff account" description="Members get their login from the Members page.">
          <StaffUserForm roles={STAFF_ROLE_OPTIONS} />
        </Card>
      </div>
    </>
  );
}
