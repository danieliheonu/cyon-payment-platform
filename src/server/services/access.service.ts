import "server-only";
import { assertCan, type Actor } from "@/domain/actor";
import { Role, type FinanceArea } from "@/domain/enums";
import { ConflictError, NotFoundError, RuleError, ValidationError } from "@/domain/errors";
import { GRANTABLE_ROLES, Permission, isGrantActive } from "@/domain/permissions";
import { dateOnlyToDb, type DateOnly } from "@/lib/dates";
import type { Clock } from "@/server/ports/file-storage";
import type { GrantView, Repositories, UnitOfWork, UserRecord } from "@/server/ports/repositories";
import { temporaryPassword, type PasswordHasher } from "@/server/auth/crypto";
import type { BootstrapAdminInput, StaffUserInput } from "@/lib/validation/schemas";

/** Public, non-sensitive view of a user account. */
export type UserView = Omit<UserRecord, "passwordHash">;

function view(user: UserRecord): UserView {
  const { passwordHash, ...rest } = user;
  void passwordHash;
  return rest;
}

/**
 * Super Admin functions: accounts, roles and finance-area grants.
 * Rule: only the Super Admin grants finance access; the last active Super Admin
 * can never be removed; every change needs a reason and is audit-logged.
 */
export class AccessService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly hasher: PasswordHasher,
    private readonly clock: Clock,
  ) {}

  async listUsers(actor: Actor, filter: { roles?: Role[]; search?: string } = {}): Promise<UserView[]> {
    assertCan(actor, Permission.MANAGE_USERS);
    return (await this.uow.read.users.list(filter)).map(view);
  }

  async hasActiveSuperAdmin(): Promise<boolean> {
    return (await this.uow.read.users.countActive(Role.SUPER_ADMIN)) > 0;
  }

  /**
   * Creates the first Super Admin (from SUPER_ADMIN_* environment variables at deploy time).
   * Only works while no active Super Admin exists — after that, accounts are managed in the app.
   * Not reachable from the web. By default the password must be changed at first sign-in, so
   * the value kept in the environment stops working once used.
   */
  async bootstrapSuperAdmin(input: BootstrapAdminInput, { mustChangePassword = true } = {}): Promise<UserView> {
    const passwordHash = await this.hasher.hash(input.password);
    return this.uow.run(async (repos) => {
      const existing = await repos.users.list({ roles: [Role.SUPER_ADMIN] });
      if (existing.some((u) => u.isActive)) {
        throw new RuleError("A Super Admin already exists. Sign in as them to add or change accounts.");
      }
      const user = await repos.users.create({
        name: input.name,
        email: input.email,
        phone: input.phone,
        role: Role.SUPER_ADMIN,
        passwordHash,
        memberId: null,
        mustChangePassword,
      });
      await repos.audit.record({ actorId: null, action: "user.bootstrap_super_admin", entity: "User", entityId: user.id, after: view(user) });
      return view(user);
    });
  }

  async createStaffUser(actor: Actor, input: StaffUserInput): Promise<{ user: UserView; temporaryPassword: string }> {
    assertCan(actor, Permission.MANAGE_USERS);
    if (input.role === Role.MEMBER) {
      throw new ValidationError("Member accounts are created from the Members page.", { role: "Choose a staff role." });
    }
    const password = temporaryPassword();
    const passwordHash = await this.hasher.hash(password);
    const user = await this.uow.run(async (repos) => {
      const created = await repos.users.create({
        name: input.name,
        email: input.email,
        phone: input.phone,
        role: input.role,
        passwordHash,
        memberId: null,
        mustChangePassword: true,
      });
      await repos.audit.record({ actorId: actor.userId, action: "user.created", entity: "User", entityId: created.id, after: view(created) });
      return created;
    });
    return { user: view(user), temporaryPassword: password };
  }

  async changeRole(actor: Actor, userId: string, role: Role, reason: string): Promise<UserView> {
    assertCan(actor, Permission.MANAGE_USERS);
    return this.uow.run(async (repos) => {
      const user = await this.requireUser(repos, userId);
      if (user.role === role) return view(user);
      if (user.memberId === null && role === Role.MEMBER) {
        throw new RuleError("Only accounts linked to a member record can have the Member role.");
      }
      await this.assertNotLastSuperAdmin(repos, user, user.role === Role.SUPER_ADMIN && role !== Role.SUPER_ADMIN);

      const updated = await repos.users.update(userId, { role });
      // Grants only apply to Admin / Super Admin; revoke any that would become meaningless.
      if (!GRANTABLE_ROLES.includes(role)) {
        await this.revokeAllActive(repos, actor, userId, `Role changed to ${role}`);
      }
      await repos.audit.record({
        actorId: actor.userId,
        action: "user.role_changed",
        entity: "User",
        entityId: userId,
        before: { role: user.role },
        after: { role },
        reason,
      });
      return view(updated);
    });
  }

  async setActive(actor: Actor, userId: string, active: boolean, reason: string): Promise<UserView> {
    assertCan(actor, Permission.MANAGE_USERS);
    return this.uow.run(async (repos) => {
      const user = await this.requireUser(repos, userId);
      if (user.isActive === active) return view(user);
      await this.assertNotLastSuperAdmin(repos, user, !active && user.role === Role.SUPER_ADMIN);
      const updated = await repos.users.update(userId, { isActive: active });
      if (!active) await repos.sessions.deleteAllForUser(userId);
      await repos.audit.record({
        actorId: actor.userId,
        action: active ? "user.activated" : "user.deactivated",
        entity: "User",
        entityId: userId,
        before: { isActive: user.isActive },
        after: { isActive: active },
        reason,
      });
      return view(updated);
    });
  }

  /** Issues a new temporary password (Super Admin for any account; Admin for member accounts). */
  async resetPassword(actor: Actor, userId: string): Promise<string> {
    const user = await this.uow.read.users.findById(userId);
    if (!user) throw new NotFoundError("User");
    assertCan(actor, user.role === Role.MEMBER ? Permission.MANAGE_MEMBERS : Permission.MANAGE_USERS);
    const password = temporaryPassword();
    const passwordHash = await this.hasher.hash(password);
    await this.uow.run(async (repos) => {
      await repos.users.update(userId, { passwordHash, mustChangePassword: true });
      await repos.sessions.deleteAllForUser(userId);
      await repos.audit.record({ actorId: actor.userId, action: "user.password_reset", entity: "User", entityId: userId });
    });
    return password;
  }

  // ───────────── Finance grants ─────────────

  async listGrants(actor: Actor, userId?: string): Promise<GrantView[]> {
    assertCan(actor, Permission.MANAGE_GRANTS);
    return this.uow.read.grants.list({ userId });
  }

  async grant(
    actor: Actor,
    input: { userId: string; areas: FinanceArea[]; expiresOn: DateOnly | null; reason: string },
  ): Promise<GrantView[]> {
    assertCan(actor, Permission.MANAGE_GRANTS);
    const now = this.clock.now();
    // Expires at the end of the chosen day (Lagos is UTC+1 → 22:59:59Z).
    const expiresAt = input.expiresOn ? new Date(dateOnlyToDb(input.expiresOn).getTime() + 23 * 3600_000 - 1000) : null;
    if (expiresAt && expiresAt <= now) {
      throw new ValidationError("Expiry must be in the future.", { expiresOn: "Choose a future date." });
    }

    return this.uow.run(async (repos) => {
      const user = await this.requireUser(repos, input.userId);
      if (!GRANTABLE_ROLES.includes(user.role)) {
        throw new RuleError("Finance access can only be granted to an Admin or Super Admin.");
      }
      if (!user.isActive) throw new RuleError("This account is deactivated.");

      const created: GrantView[] = [];
      for (const area of input.areas) {
        const existing = await repos.grants.findUnrevoked(user.id, area);
        if (existing && isGrantActive(existing, now)) {
          throw new ConflictError(`${user.name} already has an active grant for this area.`);
        }
        if (existing) {
          // Expired but not revoked: close it so the new grant can take its place.
          await repos.grants.revoke(existing.id, { revokedById: actor.userId, reason: "Expired; replaced by a new grant", at: now });
        }
        const grant = await repos.grants.create({ userId: user.id, area, reason: input.reason, grantedById: actor.userId, expiresAt });
        await repos.audit.record({
          actorId: actor.userId,
          action: user.id === actor.userId ? "grant.created_self" : "grant.created",
          entity: "PermissionGrant",
          entityId: grant.id,
          after: { userId: user.id, userName: user.name, area, expiresAt },
          reason: input.reason,
        });
        created.push(grant);
      }
      return created;
    });
  }

  async revoke(actor: Actor, grantId: string, reason: string): Promise<GrantView> {
    assertCan(actor, Permission.MANAGE_GRANTS);
    return this.uow.run(async (repos) => {
      const grant = await repos.grants.findById(grantId);
      if (!grant) throw new NotFoundError("Grant");
      if (grant.revokedAt) throw new ConflictError("This grant has already been revoked.");
      const revoked = await repos.grants.revoke(grantId, { revokedById: actor.userId, reason, at: this.clock.now() });
      await repos.audit.record({
        actorId: actor.userId,
        action: "grant.revoked",
        entity: "PermissionGrant",
        entityId: grantId,
        before: { userId: grant.userId, area: grant.area, expiresAt: grant.expiresAt },
        reason,
      });
      return revoked;
    });
  }

  // ───────────── helpers ─────────────

  private async requireUser(repos: Repositories, userId: string): Promise<UserRecord> {
    const user = await repos.users.findById(userId);
    if (!user) throw new NotFoundError("User");
    return user;
  }

  private async assertNotLastSuperAdmin(repos: Repositories, user: UserRecord, removing: boolean): Promise<void> {
    if (!removing || !user.isActive) return;
    if ((await repos.users.countActive(Role.SUPER_ADMIN)) <= 1) {
      throw new RuleError("This is the last active Super Admin. Make someone else Super Admin first.");
    }
  }

  private async revokeAllActive(repos: Repositories, actor: Actor, userId: string, reason: string): Promise<void> {
    const grants = await repos.grants.list({ userId });
    for (const grant of grants.filter((g) => !g.revokedAt)) {
      await repos.grants.revoke(grant.id, { revokedById: actor.userId, reason, at: this.clock.now() });
      await repos.audit.record({ actorId: actor.userId, action: "grant.revoked", entity: "PermissionGrant", entityId: grant.id, reason });
    }
  }
}
