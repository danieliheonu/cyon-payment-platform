import "server-only";
import type { FinanceArea, Role } from "@/domain/enums";
import type { RateLimitRepository,
  GrantRepository,
  GrantView,
  NewUser,
  SessionRepository,
  UserRecord,
  UserRepository,
} from "@/server/ports/repositories";
import type { GrantRecord } from "@/server/auth/permission-resolver";
import { uniqueOr, type Db } from "./db";

const USER_TAKEN = "That email or phone number is already used by another account.";

export class PrismaUserRepository implements UserRepository {
  constructor(private readonly db: Db) {}

  findById(id: string): Promise<UserRecord | null> {
    return this.db.user.findUnique({ where: { id } });
  }

  findByEmail(email: string): Promise<UserRecord | null> {
    return this.db.user.findUnique({ where: { email } });
  }

  findByPhone(phone: string): Promise<UserRecord | null> {
    return this.db.user.findUnique({ where: { phone } });
  }

  findByMemberId(memberId: string): Promise<UserRecord | null> {
    return this.db.user.findUnique({ where: { memberId } });
  }

  create(user: NewUser): Promise<UserRecord> {
    return uniqueOr(() => this.db.user.create({ data: user }), USER_TAKEN);
  }

  update(id: string, patch: Partial<UserRecord>): Promise<UserRecord> {
    return uniqueOr(() => this.db.user.update({ where: { id }, data: patch }), USER_TAKEN);
  }

  list(filter: { roles?: Role[]; search?: string }): Promise<UserRecord[]> {
    const search = filter.search?.trim();
    return this.db.user.findMany({
      where: {
        role: filter.roles ? { in: filter.roles } : undefined,
        OR: search
          ? [
              { name: { contains: search, mode: "insensitive" as const } },
              { email: { contains: search, mode: "insensitive" as const } },
              { phone: { contains: search } },
            ]
          : undefined,
      },
      orderBy: [{ role: "desc" }, { name: "asc" }],
    });
  }

  countActive(role: Role): Promise<number> {
    return this.db.user.count({ where: { role, isActive: true } });
  }
}

export class PrismaSessionRepository implements SessionRepository {
  constructor(private readonly db: Db) {}

  async create(session: { tokenHash: string; userId: string; expiresAt: Date }): Promise<void> {
    await this.db.session.create({ data: session });
  }

  async findActive(tokenHash: string, now: Date) {
    const session = await this.db.session.findUnique({ where: { tokenHash } });
    if (!session || session.expiresAt <= now) return null;
    return { userId: session.userId, expiresAt: session.expiresAt };
  }

  async extend(tokenHash: string, expiresAt: Date): Promise<void> {
    await this.db.session.updateMany({ where: { tokenHash }, data: { expiresAt } });
  }

  async delete(tokenHash: string): Promise<void> {
    await this.db.session.deleteMany({ where: { tokenHash } });
  }

  async deleteAllForUser(userId: string): Promise<void> {
    await this.db.session.deleteMany({ where: { userId } });
  }

  async deleteExpired(now: Date): Promise<number> {
    return (await this.db.session.deleteMany({ where: { expiresAt: { lte: now } } })).count;
  }
}

export class PrismaRateLimitRepository implements RateLimitRepository {
  constructor(private readonly db: Db) {}

  count(key: string, since: Date): Promise<number> {
    return this.db.rateLimitHit.count({ where: { key, createdAt: { gt: since } } });
  }

  async record(keys: readonly string[], at: Date): Promise<void> {
    if (keys.length) await this.db.rateLimitHit.createMany({ data: keys.map((key) => ({ key, createdAt: at })) });
  }

  async clear(key: string): Promise<void> {
    await this.db.rateLimitHit.deleteMany({ where: { key } });
  }

  async purgeBefore(at: Date): Promise<number> {
    return (await this.db.rateLimitHit.deleteMany({ where: { createdAt: { lt: at } } })).count;
  }
}

const GRANT_INCLUDE = {
  user: { select: { name: true } },
  grantedBy: { select: { name: true } },
  revokedBy: { select: { name: true } },
} as const;

type GrantRow = {
  id: string;
  userId: string;
  area: FinanceArea;
  reason: string;
  grantedById: string;
  grantedAt: Date;
  expiresAt: Date | null;
  revokedAt: Date | null;
  revokeReason: string | null;
  user: { name: string };
  grantedBy: { name: string };
  revokedBy: { name: string } | null;
};

function toGrantView(row: GrantRow): GrantView {
  return {
    id: row.id,
    userId: row.userId,
    userName: row.user.name,
    area: row.area,
    reason: row.reason,
    grantedById: row.grantedById,
    grantedByName: row.grantedBy.name,
    grantedAt: row.grantedAt,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
    revokedByName: row.revokedBy?.name ?? null,
    revokeReason: row.revokeReason,
  };
}

export class PrismaGrantRepository implements GrantRepository {
  constructor(private readonly db: Db) {}

  grantsForUser(userId: string): Promise<GrantRecord[]> {
    return this.db.permissionGrant.findMany({
      where: { userId, revokedAt: null },
      select: { area: true, expiresAt: true, revokedAt: true },
    });
  }

  async create(grant: { userId: string; area: FinanceArea; reason: string; grantedById: string; expiresAt: Date | null }) {
    const row = await uniqueOr(
      () => this.db.permissionGrant.create({ data: grant, include: GRANT_INCLUDE }),
      "This person already has an active grant for that area.",
    );
    return toGrantView(row);
  }

  async findUnrevoked(userId: string, area: FinanceArea) {
    const row = await this.db.permissionGrant.findFirst({ where: { userId, area, revokedAt: null }, include: GRANT_INCLUDE });
    return row ? toGrantView(row) : null;
  }

  async findById(id: string) {
    const row = await this.db.permissionGrant.findUnique({ where: { id }, include: GRANT_INCLUDE });
    return row ? toGrantView(row) : null;
  }

  async revoke(id: string, revoke: { revokedById: string; reason: string; at: Date }) {
    const row = await this.db.permissionGrant.update({
      where: { id },
      data: { revokedAt: revoke.at, revokedById: revoke.revokedById, revokeReason: revoke.reason },
      include: GRANT_INCLUDE,
    });
    return toGrantView(row);
  }

  async list(filter: { userId?: string }) {
    const rows = await this.db.permissionGrant.findMany({
      where: { userId: filter.userId },
      include: GRANT_INCLUDE,
      orderBy: { grantedAt: "desc" },
    });
    return rows.map(toGrantView);
  }
}
