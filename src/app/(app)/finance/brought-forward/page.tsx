import type { Metadata } from "next";
import Link from "next/link";
import { can } from "@/domain/actor";
import { koboToNairaString } from "@/domain/money";
import { Permission } from "@/domain/permissions";
import { formatDateTime, toLagosDateOnly, yearOf } from "@/lib/dates";
import { BroughtForwardForm } from "@/components/finance-forms";
import { Card, DataTable, Money, PageHeader } from "@/components/ui";
import { services } from "@/server/container";
import { requirePermission } from "@/server/auth/session";

export const metadata: Metadata = { title: "Brought forward" };

export default async function BroughtForwardPage() {
  const actor = await requirePermission(Permission.VIEW_REPORTS);
  const year = yearOf(toLagosDateOnly());
  const years = await services().financialYears.list();
  const current = years.find((y) => y.year === year);

  return (
    <>
      <PageHeader
        title="Balance brought forward"
        description="CYON's fund balance carried over from the previous year, recorded each year for financial transparency. Every change is kept in the audit log."
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
        <DataTable
          rows={years}
          rowKey={(y) => y.id}
          empty="Nothing recorded yet."
          columns={[
            { header: "Year", cell: (y) => <Link className="text-brand hover:underline" href={`/staff/reports/year/${y.year}`}>{y.year}</Link> },
            { header: "Brought forward", align: "right", cell: (y) => <Money kobo={y.broughtForwardKobo} /> },
            { header: "Note", cell: (y) => y.note ?? "—" },
            { header: "Last changed", cell: (y) => formatDateTime(y.updatedAt) },
          ]}
        />
        {can(actor, Permission.MANAGE_BROUGHT_FORWARD) ? (
          <Card title="Record or update">
            <BroughtForwardForm year={year} current={current ? { amount: koboToNairaString(current.broughtForwardKobo), note: current.note ?? "" } : null} />
          </Card>
        ) : (
          <p className="text-sm text-muted">Only the Financial Officer (or an admin granted “Brought forward”) can record this.</p>
        )}
      </div>
    </>
  );
}
