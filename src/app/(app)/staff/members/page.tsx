import type { Metadata } from "next";
import Link from "next/link";
import { can } from "@/domain/actor";
import { MemberStatus } from "@/domain/enums";
import { Permission } from "@/domain/permissions";
import { formatDateOnly, toLagosDateOnly } from "@/lib/dates";
import { FilterBar } from "@/components/filter-bar";
import { Badge, Card, DataTable, PageHeader, Pagination } from "@/components/ui";
import { pageFromParams, param } from "@/lib/validation/query";
import { env } from "@/lib/env";
import { services } from "@/server/container";
import { requirePermission } from "@/server/auth/session";
import { MemberForm } from "./member-form";

export const metadata: Metadata = { title: "Members" };

export default async function MembersPage({ searchParams }: PageProps<"/staff/members">) {
  const actor = await requirePermission(Permission.VIEW_ALL_PAYMENTS);
  const params = await searchParams;
  const status = param(params, "status");
  const search = param(params, "q");
  const result = await services().members.list(
    actor,
    { search, status: status && status in MemberStatus ? (status as MemberStatus) : undefined },
    pageFromParams(params, 50),
  );

  return (
    <>
      <PageHeader title="Members" description="Each member's record holds their dues, payments and receipts." />
      {can(actor, Permission.MANAGE_MEMBERS) ? (
        <Card title="Add a member" className="mb-6">
          <MemberForm today={toLagosDateOnly()} orgName={env().ORG_NAME} signInUrl={`${env().APP_URL}/login`} />
        </Card>
      ) : null}
      <FilterBar
        keep={{ pageSize: param(params, "pageSize") }}
        fields={[
          { kind: "search", name: "q", label: "Search", placeholder: "Name, member no, phone or email" },
          { kind: "select", name: "status", label: "Status", options: [{ value: "ACTIVE", label: "Active" }, { value: "INACTIVE", label: "Inactive" }] },
        ]}
        values={{ q: search, status }}
      />
      <DataTable
        rows={result.rows}
        rowKey={(m) => m.id}
        empty="No members found."
        columns={[
          { header: "Name", cell: (m) => <Link className="font-medium text-brand hover:underline" href={`/staff/members/${m.id}`}>{m.fullName}</Link> },
          { header: "Phone", cell: (m) => m.phone },
          { header: "Joined", cell: (m) => formatDateOnly(m.joinedAt) },
          { header: "Status", cell: (m) => <Badge className={m.status === "ACTIVE" ? "bg-success-soft text-success" : undefined}>{m.status === "ACTIVE" ? "Active" : "Inactive"}</Badge> },
          { header: "Login", cell: (m) => (m.hasLogin ? "Yes" : <span className="text-muted">No</span>) },
        ]}
      />
      <Pagination page={result.page} pageSize={result.pageSize} total={result.total} params={new URLSearchParams({ ...(search ? { q: search } : {}), ...(status ? { status } : {}) })} />
    </>
  );
}
