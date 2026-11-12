import type { Metadata } from "next";
import { Card, PageHeader } from "@/components/ui";
import { Permission } from "@/domain/permissions";
import { toLagosDateOnly } from "@/lib/dates";
import { services } from "@/server/container";
import { requirePermission } from "@/server/auth/session";
import { CashForm } from "./cash-form";

export const metadata: Metadata = { title: "Record cash" };

export default async function CashPage() {
  const actor = await requirePermission(Permission.RECORD_CASH);
  const [members, categories] = await Promise.all([
    services().members.list(actor, { status: "ACTIVE" }, { page: 1, pageSize: 5000 }),
    services().categories.list({ activeOnly: true }),
  ]);
  return (
    <>
      <PageHeader title="Record cash" description="Cash you have counted is confirmed immediately and a receipt is issued." />
      <Card className="max-w-2xl">
        <CashForm
          members={members.rows.map((m) => ({ value: m.id, label: m.fullName }))}
          categories={categories.map((c) => ({ value: c.id, label: c.name }))}
          today={toLagosDateOnly()}
        />
      </Card>
    </>
  );
}
