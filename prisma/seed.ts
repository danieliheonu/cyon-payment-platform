/**
 * Development seed — realistic sample data created through the real services, so every
 * business rule (dues generation, allocation, receipts, audit) applies.
 *   npm run db:seed          (empty database only; reset with `npx prisma migrate reset`)
 * All seeded accounts use the password printed at the end.
 */
import { randomBytes } from "node:crypto";
import type { Actor } from "@/domain/actor";
import { normalizePhone } from "@/lib/contact";
import { toLagosDateOnly, yearOf, type DateOnly } from "@/lib/dates";
import { services } from "@/server/container";
import { prismaClient } from "@/server/infra/prisma/client";
import { run } from "../scripts/cli";

const PASSWORD = "Cyon-dev-2026";
// Development default for new member logins (used unless .env sets one).
process.env.MEMBER_DEFAULT_PASSWORD ||= "Welcome-2026";
const s = services();

async function signIn(identifier: string, password = PASSWORD): Promise<Actor> {
  const { token } = await s.auth.login(identifier, password);
  return (await s.auth.resolveActor(token))!.actor;
}

/** Sign in with a temporary password and replace it — the same path a real user takes. */
async function activate(identifier: string, temporaryPassword: string): Promise<Actor> {
  const actor = await signIn(identifier, temporaryPassword);
  await s.auth.changePassword(actor, temporaryPassword, PASSWORD);
  return signIn(identifier);
}

function proof() {
  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...randomBytes(32)]);
  return { name: "transfer-receipt.png", bytes: png };
}

const key = () => randomBytes(12).toString("hex");

run(async () => {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to seed a production database.");
  const prisma = prismaClient(process.env.DATABASE_URL!);
  if ((await prisma.user.count()) > 0) {
    console.log("Database already has users — skipping seed. Run `npx prisma migrate reset` for a fresh start.");
    return;
  }

  const today = toLagosDateOnly();
  const year = yearOf(today);
  const daysAgo = (n: number): DateOnly => toLagosDateOnly(new Date(Date.now() - n * 86_400_000));

  // ── People ──
  await s.access.bootstrapSuperAdmin(
    { name: "Chinedu Okafor", email: "superadmin@cyon.test", phone: null, password: PASSWORD },
    { mustChangePassword: false },
  );
  const superAdmin = await signIn("superadmin@cyon.test");
  const fo = await s.access.createStaffUser(superAdmin, { name: "Ngozi Eze", email: "officer@cyon.test", phone: null, role: "FINANCIAL_OFFICER" });
  const officer = await activate("officer@cyon.test", fo.temporaryPassword);
  const ad = await s.access.createStaffUser(superAdmin, { name: "Emeka Obi", email: "admin@cyon.test", phone: null, role: "ADMIN" });
  await activate("admin@cyon.test", ad.temporaryPassword);

  // ── Categories (Admin) ──
  const category = (name: string, group: "DUES" | "LEVY" | "EVENT" | "DONATION", pricing: "FIXED" | "OPEN") =>
    s.categories.create(superAdmin, { name, group, pricing, startsOn: `${year - 1}-01-01`, isActive: true });
  const dues = await category("Monthly dues", "DUES", "FIXED");
  const levy = await category("Development levy", "LEVY", "FIXED");
  const youthWeek = await category("Youth Week", "EVENT", "FIXED");
  const donations = await category("Donations", "DONATION", "OPEN");

  // ── Finance setup (Financial Officer) ──
  const account = await s.bankAccounts.create(officer, { bankName: "First Bank", accountName: "CYON St. Mary's Parish", accountNumber: "3012345678", usage: "GENERAL", isActive: true, sortOrder: 0 });
  await s.rates.setRate(officer, { categoryId: dues.id, year, frequency: "MONTHLY", amount: 50_000, note: "₦500 per month", reason: undefined });
  await s.rates.setRate(officer, { categoryId: levy.id, year, frequency: "YEARLY", amount: 500_000, note: null, reason: undefined });
  await s.rates.setRate(officer, { categoryId: youthWeek.id, year, frequency: "ONE_OFF", amount: 200_000, note: null, reason: undefined });
  await s.financialYears.setBroughtForward(officer, { year, amount: 25_000_000, note: `Closing balance of ${year - 1} per the treasurer's books`, reason: undefined });

  // ── Members (Admin) — dues are generated from the join date ──
  const people = [
    { fullName: "Adaeze Nwosu", phone: "08031234567", email: "member@cyon.test" },
    { fullName: "Tunde Bakare", phone: "08039876543", email: null },
    { fullName: "Blessing Okon", phone: "08025550101", email: "blessing@cyon.test" },
    { fullName: "Ifeanyi Uche", phone: "08094443322", email: null },
  ];
  const members = [];
  for (const p of people) {
    const member = await s.members.create(superAdmin, { ...p, phone: normalizePhone(p.phone)!, joinedAt: `${year}-01-10`, createLogin: Boolean(p.email) });
    members.push(member);
    if (p.email) await activate(p.email, process.env.MEMBER_DEFAULT_PASSWORD!);
  }
  await s.obligations.applyCharge(officer, { categoryId: youthWeek.id, year, name: null, memberIds: [], allMembers: true, amount: null });

  // ── Payments ──
  const ada = await signIn("member@cyon.test");
  const transfer = (categoryId: string, amount: number, paidOn: DateOnly) => ({
    categoryId, bankAccountId: account.id, targetObligationId: null, amount, paidOn,
    senderName: "Adaeze Nwosu", senderBank: "GTBank", idempotencyKey: key(),
  });
  const p1 = await s.submissions.submitMemberTransfer(ada, transfer(dues.id, 250_000, daysAgo(40)), proof());
  await s.confirmations.confirm(officer, p1.id);
  const p2 = await s.submissions.submitMemberTransfer(ada, transfer(levy.id, 300_000, daysAgo(12)), proof()); // part payment
  await s.confirmations.confirm(officer, p2.id);
  await s.submissions.submitMemberTransfer(ada, transfer(youthWeek.id, 200_000, daysAgo(1)), proof()); // left pending

  await s.submissions.recordCash(officer, { memberId: members[1].id, payerName: null, categoryId: dues.id, targetObligationId: null, amount: 300_000, paidOn: daysAgo(20), note: "Paid at the general meeting", idempotencyKey: key() });
  await s.submissions.recordCash(officer, { memberId: null, payerName: "Mrs. Okoro (parishioner)", categoryId: donations.id, targetObligationId: null, amount: 1_000_000, paidOn: daysAgo(5), note: null, idempotencyKey: key() });

  // ── A payment link with its own account ──
  const link = await s.paymentLinks.create(officer, {
    title: `Christmas outreach ${year}`, purpose: "Food items and gifts for the elderly at the parish Christmas outreach.",
    categoryId: donations.id, bankAccountId: null, newBankName: "Access Bank", newAccountName: "CYON Outreach Committee", newAccountNumber: "0698765432",
    amountMode: "MINIMUM", amount: 100_000, target: 50_000_000, closesOn: `${year}-12-20`, autoCloseOnTarget: true,
  });
  const guest = await s.submissions.submitLinkTransfer(link.slug, { ...transfer(donations.id, 500_000, daysAgo(2)), payerName: "Tunde Bakare", payerPhone: normalizePhone("08039876543"), payerEmail: null }, proof());

  const base = process.env.APP_URL ?? "http://localhost:3000";
  console.log(`
✓ Seeded ${year} sample data. Password for every account: ${PASSWORD}

  Super Admin        superadmin@cyon.test
  Financial Officer  officer@cyon.test
  Admin              admin@cyon.test      (no finance access until granted)
  Member             member@cyon.test     (or 08031234567)

  Payment link       ${base}/p/${link.slug}
  Guest status page  ${base}/p/${link.slug}/s/${guest.statusToken}
`);
});
