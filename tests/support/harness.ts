import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaUnitOfWork } from "@/server/infra/prisma/unit-of-work";
import { buildServices, type Services } from "@/server/container";
import type { Clock, FileStorage } from "@/server/ports/file-storage";
import type { Actor } from "@/domain/actor";
import type { Role } from "@/domain/enums";
import { bcryptHasher } from "@/server/auth/crypto";

/** In-memory storage fake (same contract as Supabase/local storage). */
export class MemoryStorage implements FileStorage {
  readonly files = new Map<string, Uint8Array>();
  async upload(key: string, data: Uint8Array) {
    if (this.files.has(key)) throw new Error("exists");
    this.files.set(key, data);
  }
  async delete(key: string) {
    this.files.delete(key);
  }
  async download(key: string) {
    const file = this.files.get(key);
    if (!file) throw new Error("missing");
    return file;
  }
}

export class TestClock implements Clock {
  constructor(public current: Date) {}
  now() {
    return this.current;
  }
  set(iso: string) {
    this.current = new Date(iso);
  }
}

let migrated = false;
const TEST_URL = process.env.DATABASE_URL!;

export function migrateTestDatabase() {
  if (migrated) return;
  execSync("npx prisma migrate deploy", { env: { ...process.env, DIRECT_URL: TEST_URL, DATABASE_URL: TEST_URL }, stdio: "pipe" });
  migrated = true;
}

export interface Harness {
  prisma: PrismaClient;
  services: Services;
  clock: TestClock;
  storage: MemoryStorage;
  /** Creates a user (and member record for MEMBER) and returns a fully resolved Actor via real sign-in. */
  actor(role: Role, name?: string): Promise<Actor>;
  refresh(actor: Actor): Promise<Actor>;
  reset(): Promise<void>;
}

const TABLES = [
  "AuditLog", "Receipt", "ReceiptCounter", "PaymentAllocation", "Payment", "PaymentLink", "BankAccount",
  "Obligation", "FinancialYear", "CategoryRate", "PaymentCategory", "PermissionGrant", "Session", "RateLimitHit", "User", "Member",
];

export const MEMBER_DEFAULT_PASSWORD = "Welcome-2026";

export function createHarness(startIso = "2026-03-10T09:00:00Z"): Harness {
  migrateTestDatabase();
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: TEST_URL }) });
  const clock = new TestClock(new Date(startIso));
  const storage = new MemoryStorage();
  const services = buildServices({
    uow: new PrismaUnitOfWork(prisma, "CYON"),
    proofs: storage,
    backups: storage,
    clock,
    orgName: "CYON",
    memberDefaultPassword: MEMBER_DEFAULT_PASSWORD,
  });
  const tokens = new Map<string, string>();
  let counter = 0;

  return {
    prisma,
    services,
    clock,
    storage,
    async actor(role, name) {
      counter += 1;
      const password = "Passw0rd!";
      const memberId =
        role === "MEMBER"
          ? (
              await prisma.member.create({
                data: {
                  memberNo: `T-${counter}-${randomBytes(2).toString("hex")}`,
                  fullName: name ?? `Member ${counter}`,
                  phone: `080${String(10000000 + counter).slice(-8)}`,
                  joinedAt: new Date("2026-01-15"),
                },
              })
            ).id
          : null;
      const user = await prisma.user.create({
        data: {
          name: name ?? `${role} ${counter}`,
          email: `user${counter}-${randomBytes(3).toString("hex")}@test.ng`,
          passwordHash: await bcryptHasher.hash(password),
          role,
          memberId,
          mustChangePassword: false,
        },
      });
      const { token } = await services.auth.login(user.email!, password);
      tokens.set(user.id, token);
      return (await services.auth.resolveActor(token))!.actor;
    },
    async refresh(actor) {
      return (await services.auth.resolveActor(tokens.get(actor.userId)!))!.actor;
    },
    async reset() {
      clock.set(startIso);
      await prisma.$executeRawUnsafe(`TRUNCATE ${TABLES.map((t) => `"${t}"`).join(", ")} CASCADE`);
    },
  };
}

/** A small valid PNG-signature file; `seed` makes the content (and hash) unique. */
export function pngProof(seed = randomBytes(8).toString("hex")) {
  const header = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const body = new TextEncoder().encode(seed);
  const bytes = new Uint8Array(header.length + body.length);
  bytes.set(header);
  bytes.set(body, header.length);
  return { name: "proof.png", bytes };
}

export function key() {
  return randomBytes(12).toString("hex");
}
