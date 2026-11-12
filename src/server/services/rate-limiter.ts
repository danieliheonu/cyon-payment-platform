import "server-only";
import { RateLimitedError } from "@/domain/errors";
import type { Clock } from "@/server/ports/file-storage";
import type { UnitOfWork } from "@/server/ports/repositories";

export interface RateRule {
  key: string;
  limit: number;
  windowMs: number;
}

const MINUTE = 60_000;

/**
 * The rate-limit policy in one place. Per-IP limits are generous because many
 * Nigerian mobile users share one public IP (carrier-grade NAT).
 */
export const RATE_LIMITS = {
  /** Failed sign-ins for one email/phone. */
  loginPerAccount: (identifier: string): RateRule => ({ key: `login:id:${identifier}`, limit: 5, windowMs: 15 * MINUTE }),
  /** Failed sign-ins from one IP address, across all accounts. */
  loginPerIp: (ip: string): RateRule => ({ key: `login:ip:${ip}`, limit: 50, windowMs: 15 * MINUTE }),
  /** Wrong "current password" attempts on the change-password form. */
  passwordChange: (userId: string): RateRule => ({ key: `password:user:${userId}`, limit: 5, windowMs: 15 * MINUTE }),
  /** Public payment-link submissions from one IP address. */
  linkSubmitPerIp: (ip: string): RateRule => ({ key: `link:ip:${ip}`, limit: 30, windowMs: 60 * MINUTE }),
} as const;

/** Rows older than this are purged by the daily maintenance job (longer than any window). */
export const RATE_LIMIT_RETENTION_MS = 24 * 60 * MINUTE;

/** Fixed-window counters backed by the database, so limits hold across serverless instances. */
export class RateLimiter {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
  ) {}

  /** Throws RateLimitedError when any rule has reached its limit. */
  async check(rules: readonly RateRule[], message: string): Promise<void> {
    const now = this.clock.now().getTime();
    for (const rule of rules) {
      const count = await this.uow.read.rateLimits.count(rule.key, new Date(now - rule.windowMs));
      if (count >= rule.limit) throw new RateLimitedError(message);
    }
  }

  async hit(rules: readonly RateRule[]): Promise<void> {
    await this.uow.read.rateLimits.record(
      rules.map((r) => r.key),
      this.clock.now(),
    );
  }

  async clear(rule: RateRule): Promise<void> {
    await this.uow.read.rateLimits.clear(rule.key);
  }
}
