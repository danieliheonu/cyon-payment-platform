import "server-only";
import type { Actor } from "@/domain/actor";
import { UnauthenticatedError, ValidationError } from "@/domain/errors";
import { parseLoginIdentifier } from "@/lib/contact";
import type { Clock } from "@/server/ports/file-storage";
import type { Repositories, UnitOfWork, UserRecord } from "@/server/ports/repositories";
import type { PermissionResolver } from "@/server/auth/permission-resolver";
import { randomToken, sha256Hex, type PasswordHasher } from "@/server/auth/crypto";
import { RATE_LIMITS, type RateLimiter } from "./rate-limiter";

const SESSION_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;
const INVALID_LOGIN = "Incorrect email/phone or password.";
const TOO_MANY_LOGINS = "Too many failed sign-in attempts. Wait 15 minutes and try again, or ask the administrator to reset your password.";

/** Sign-in, sign-out, sessions and passwords. Sessions are stored server-side (revocable). */
export class AuthService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly hasher: PasswordHasher,
    private readonly resolver: PermissionResolver,
    private readonly limiter: RateLimiter,
    private readonly clock: Clock,
  ) {}

  /** Hash of a random password, checked when the account doesn't exist so both cases take as long. */
  private dummyHash?: Promise<string>;

  /**
   * Signs in by email or phone. Failed attempts are limited per account and per IP;
   * the same message and timing are used whether or not the account exists.
   */
  async login(identifier: string, password: string, clientIp: string | null = null): Promise<{ token: string; expiresAt: Date; user: UserRecord }> {
    const parsed = parseLoginIdentifier(identifier);
    const accountRule = RATE_LIMITS.loginPerAccount(parsed?.value ?? identifier.trim().toLowerCase());
    const rules = clientIp ? [accountRule, RATE_LIMITS.loginPerIp(clientIp)] : [accountRule];
    await this.limiter.check(rules, TOO_MANY_LOGINS);

    const user = parsed
      ? parsed.kind === "email"
        ? await this.uow.read.users.findByEmail(parsed.value)
        : await this.uow.read.users.findByPhone(parsed.value)
      : null;
    this.dummyHash ??= this.hasher.hash(randomToken());
    const passwordOk = await this.hasher.verify(password, user?.passwordHash ?? (await this.dummyHash));
    if (!user || !passwordOk) {
      await this.limiter.hit(rules);
      throw new ValidationError(INVALID_LOGIN);
    }
    await this.limiter.clear(accountRule);
    if (!user.isActive) throw new ValidationError("This account has been deactivated. Contact the administrator.");

    const lastLoginAt = this.clock.now();
    const { token, expiresAt } = await this.startSession(user.id, "auth.login", async (repos) => {
      await repos.users.update(user.id, { lastLoginAt });
    });
    return { token, expiresAt, user: { ...user, lastLoginAt } };
  }

  /** Creates a session (after any `alongside` work) and its audit entry in one transaction. */
  private async startSession(userId: string, auditAction: string, alongside?: (repos: Repositories) => Promise<void>) {
    const token = randomToken();
    const expiresAt = new Date(this.clock.now().getTime() + SESSION_DAYS * DAY_MS);
    await this.uow.run(async (repos) => {
      await alongside?.(repos);
      await repos.sessions.create({ tokenHash: sha256Hex(token), userId, expiresAt });
      await repos.audit.record({ actorId: userId, action: auditAction, entity: "User", entityId: userId });
    });
    return { token, expiresAt };
  }

  async logout(token: string): Promise<void> {
    await this.uow.read.sessions.delete(sha256Hex(token));
  }

  /**
   * Resolves the signed-in user and their effective permissions (role + active grants)
   * fresh from the database, so deactivation and revoked grants apply immediately.
   * Returns a new expiry when the session was extended (sliding expiry).
   */
  async resolveActor(token: string): Promise<{ actor: Actor; user: UserRecord; renewedUntil: Date | null } | null> {
    const now = this.clock.now();
    const tokenHash = sha256Hex(token);
    const session = await this.uow.read.sessions.findActive(tokenHash, now);
    if (!session) return null;
    const user = await this.uow.read.users.findById(session.userId);
    if (!user || !user.isActive) return null;

    let renewedUntil: Date | null = null;
    if (session.expiresAt.getTime() - now.getTime() < (SESSION_DAYS / 2) * DAY_MS) {
      renewedUntil = new Date(now.getTime() + SESSION_DAYS * DAY_MS);
      await this.uow.read.sessions.extend(tokenHash, renewedUntil);
    }

    const permissions = await this.resolver.resolve(user, now);
    return {
      actor: { userId: user.id, role: user.role, memberId: user.memberId, displayName: user.name, permissions },
      user,
      renewedUntil,
    };
  }

  /**
   * Changes the password, signs out every other session (a stolen session doesn't
   * survive a password change) and returns a fresh session for this device.
   */
  async changePassword(actor: Actor, currentPassword: string, newPassword: string): Promise<{ token: string; expiresAt: Date }> {
    const user = await this.uow.read.users.findById(actor.userId);
    if (!user) throw new UnauthenticatedError();
    const rule = RATE_LIMITS.passwordChange(user.id);
    await this.limiter.check([rule], "Too many wrong attempts. Wait 15 minutes and try again.");
    if (!(await this.hasher.verify(currentPassword, user.passwordHash))) {
      await this.limiter.hit([rule]);
      throw new ValidationError("Current password is incorrect.", { currentPassword: "Current password is incorrect." });
    }
    if (currentPassword === newPassword) {
      throw new ValidationError("Choose a new password.", { newPassword: "Must be different from the current password." });
    }
    const passwordHash = await this.hasher.hash(newPassword);
    const session = await this.startSession(user.id, "auth.password_changed", async (repos) => {
      await repos.users.update(user.id, { passwordHash, mustChangePassword: false });
      await repos.sessions.deleteAllForUser(user.id);
    });
    await this.limiter.clear(rule);
    return session;
  }

  /** Daily housekeeping: drop expired sessions and old rate-limit counters. */
  async purgeExpired(retentionMs: number): Promise<{ sessions: number; rateLimitHits: number }> {
    const now = this.clock.now();
    const [sessions, rateLimitHits] = await Promise.all([
      this.uow.read.sessions.deleteExpired(now),
      this.uow.read.rateLimits.purgeBefore(new Date(now.getTime() - retentionMs)),
    ]);
    return { sessions, rateLimitHits };
  }
}
