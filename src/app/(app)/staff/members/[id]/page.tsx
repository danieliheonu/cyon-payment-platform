import type { Metadata } from "next";
import { can } from "@/domain/actor";
import { summarizeBalances } from "@/domain/balance";
import { Permission } from "@/domain/permissions";
import { formatDateOnly, formatDateTime } from "@/lib/dates";
import { BalancesTable } from "@/components/balances";
import { LoginDetailsShare } from "@/components/login-details";
import { env } from "@/lib/env";
import { PaymentsTable } from "@/components/payments-table";
import { Card, Details, LinkButton, Money, PageHeader, Pagination, Stat } from "@/components/ui";
import { pageFromParams } from "@/lib/validation/query";
import { services } from "@/server/container";
import type { MemberLogin } from "@/server/services/member.service";
import { pageData } from "@/server/http/page-data";
import { requirePermission } from "@/server/auth/session";
import { EditMemberForm, MemberLoginForm } from "../member-form";

export const metadata: Metadata = { title: "Member" };

export default async function MemberPage({ params, searchParams }: PageProps<"/staff/members/[id]">) {
  const actor = await requirePermission(Permission.VIEW_ALL_PAYMENTS);
  const { id } = await params;
  const member = await pageData(services().members.get(actor, id));
  const canManage = can(actor, Permission.MANAGE_MEMBERS);
  const [balances, payments, login] = await Promise.all([
    services().obligations.balancesByCategory(member.id),
    services().records.listPayments(actor, { memberId: member.id }, pageFromParams(await searchParams)),
    canManage ? services().members.login(actor, member.id) : Promise.resolve(null),
  ]);
  const total = summarizeBalances(balances.map((b) => ({ amountKobo: b.dueKobo, allocatedKobo: b.paidKobo })));

  return (
    <>
      <PageHeader
        back={{ href: "/staff/members", label: "Back to members" }}
        title={member.fullName}
        description={member.status === "ACTIVE" ? "Active" : "Inactive"}
        actions={
          <LinkButton variant="secondary" href={`/api/reports/payments?memberId=${member.id}`}>
            Download history (CSV)
          </LinkButton>
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Outstanding" value={<Money kobo={total.outstandingKobo} />} tone={total.outstandingKobo ? "warning" : "brand"} />
        <Stat label="Paid (confirmed)" value={<Money kobo={total.paidKobo} />} />
        <Stat label="Total due" value={<Money kobo={total.dueKobo} />} />
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <Card title="Balances by category">
            <BalancesTable balances={balances} />
          </Card>
          <Card title="Payment history">
            <PaymentsTable payments={payments.rows} showPayer={false} />
            <Pagination page={payments.page} pageSize={payments.pageSize} total={payments.total} params={new URLSearchParams()} />
          </Card>
        </div>
        <div className="space-y-6">
          <Card title="Contact">
            <Details
              items={[
                ["Phone", member.phone],
                ["Email", member.email],
                ["Joined", formatDateOnly(member.joinedAt)],
                ["Online login", member.hasLogin ? "Yes" : "No"],
                ...(login ? ([["Last sign-in", login.lastLoginAt ? formatDateTime(login.lastLoginAt) : "Never"]] as Array<[string, string]>) : []),
              ]}
            />
          </Card>
          {canManage ? (
            <>
              <Card title="Edit member">
                <EditMemberForm member={member} />
              </Card>
              <Card title="Login" description={loginStatus(login)}>
                {login?.defaultPassword ? (
                  <LoginDetailsShare
                    memberName={member.fullName}
                    orgName={env().ORG_NAME}
                    signInUrl={`${env().APP_URL}/login`}
                    identifier={login.identifier}
                    password={login.defaultPassword}
                    phone={login.phone}
                  />
                ) : (
                  <MemberLoginForm memberId={member.id} hasLogin={Boolean(login)} />
                )}
              </Card>
            </>
          ) : null}
        </div>
      </div>
    </>
  );
}

function loginStatus(login: MemberLogin | null): string {
  if (!login) return "Let this member sign in to pay and see receipts.";
  if (login.defaultPassword) return "Send these to the member. They must choose their own password at first sign-in.";
  if (login.mustChangePassword) return "Waiting for the member's first sign-in. Reset to the default password to share login details again.";
  return "The member has set their own password. Reset it to the default if they forget it.";
}
