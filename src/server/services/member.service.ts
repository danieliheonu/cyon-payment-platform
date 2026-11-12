import "server-only";
import { assertCan, assertCanViewMemberRecords, can, type Actor } from "@/domain/actor";
import { Role, type MemberStatus } from "@/domain/enums";
import { NotFoundError, RuleError } from "@/domain/errors";
import { Permission } from "@/domain/permissions";
import type { MemberRecord, PageRequest, PageResult, UnitOfWork } from "@/server/ports/repositories";
import type { PasswordHasher } from "@/server/auth/crypto";
import type { MemberInput, MemberUpdateInput } from "@/lib/validation/schemas";
import { ForbiddenError } from "@/domain/errors";
import type { DuesGenerator } from "./obligation.service";

export interface MemberLogin {
  userId: string;
  /** What the member signs in with: their phone number, or email if they have no phone on the account. */
  identifier: string;
  phone: string | null;
  lastLoginAt: Date | null;
  mustChangePassword: boolean;
  defaultPassword: string | null;
}

/**
 * Member records and their login accounts. Admin area (MANAGE_MEMBERS).
 * New member logins start with the configured default password (MEMBER_DEFAULT_PASSWORD)
 * and must change it at first sign-in.
 */
export class MemberService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly hasher: PasswordHasher,
    private readonly dues: DuesGenerator,
    private readonly defaultPassword: string | null,
  ) {}

  private defaultPasswordHash(): Promise<string> {
    if (!this.defaultPassword) {
      throw new RuleError("Member logins need a default password. Set MEMBER_DEFAULT_PASSWORD in the environment.");
    }
    return this.hasher.hash(this.defaultPassword);
  }

  async list(actor: Actor, filter: { search?: string; status?: MemberStatus }, page: PageRequest): Promise<PageResult<MemberRecord>> {
    if (!can(actor, Permission.VIEW_ALL_PAYMENTS) && !can(actor, Permission.MANAGE_MEMBERS)) throw new ForbiddenError();
    return this.uow.read.members.list(filter, page);
  }

  async get(actor: Actor, memberId: string): Promise<MemberRecord> {
    assertCanViewMemberRecords(actor, memberId);
    const member = await this.uow.read.members.findById(memberId);
    if (!member) throw new NotFoundError("Member");
    return member;
  }

  async create(actor: Actor, input: MemberInput): Promise<MemberRecord> {
    assertCan(actor, Permission.MANAGE_MEMBERS);
    const passwordHash = input.createLogin ? await this.defaultPasswordHash() : null;

    const member = await this.uow.run(async (repos) => {
      const created = await repos.members.create({
        memberNo: await repos.members.nextMemberNo(),
        fullName: input.fullName,
        phone: input.phone,
        email: input.email,
        joinedAt: input.joinedAt,
        status: "ACTIVE",
      });
      if (passwordHash) {
        await repos.users.create({
          name: input.fullName,
          email: input.email,
          phone: input.phone,
          passwordHash,
          role: Role.MEMBER,
          memberId: created.id,
          mustChangePassword: true,
        });
      }
      await repos.audit.record({ actorId: actor.userId, action: "member.created", entity: "Member", entityId: created.id, after: created });
      return { ...created, hasLogin: Boolean(passwordHash) };
    });

    await this.dues.generateDue({ memberId: member.id });
    return member;
  }

  async update(actor: Actor, memberId: string, input: MemberUpdateInput): Promise<MemberRecord> {
    assertCan(actor, Permission.MANAGE_MEMBERS);
    const member = await this.uow.run(async (repos) => {
      const before = await repos.members.findById(memberId);
      if (!before) throw new NotFoundError("Member");
      const after = await repos.members.update(memberId, input);
      const user = await repos.users.findByMemberId(memberId);
      if (user) await repos.users.update(user.id, { name: input.fullName, phone: input.phone, email: input.email });
      await repos.audit.record({ actorId: actor.userId, action: "member.updated", entity: "Member", entityId: memberId, before, after });
      return after;
    });
    if (member.status === "ACTIVE") await this.dues.generateDue({ memberId });
    return member;
  }

  /**
   * The member's login account, if they have one. `defaultPassword` is filled only while the
   * account still uses the default password (not yet changed), so the admin can share it.
   */
  async login(actor: Actor, memberId: string): Promise<MemberLogin | null> {
    assertCan(actor, Permission.MANAGE_MEMBERS);
    const user = await this.uow.read.users.findByMemberId(memberId);
    if (!user) return null;
    const stillDefault =
      user.mustChangePassword && this.defaultPassword !== null && (await this.hasher.verify(this.defaultPassword, user.passwordHash));
    return {
      userId: user.id,
      identifier: user.phone ?? user.email ?? "",
      phone: user.phone,
      lastLoginAt: user.lastLoginAt,
      mustChangePassword: user.mustChangePassword,
      defaultPassword: stillDefault ? this.defaultPassword : null,
    };
  }

  /** Puts the member's login back on the default password (signing out their sessions). */
  async resetLogin(actor: Actor, memberId: string): Promise<void> {
    assertCan(actor, Permission.MANAGE_MEMBERS);
    const passwordHash = await this.defaultPasswordHash();
    await this.uow.run(async (repos) => {
      const user = await repos.users.findByMemberId(memberId);
      if (!user) throw new NotFoundError("Login");
      await repos.users.update(user.id, { passwordHash, mustChangePassword: true });
      await repos.sessions.deleteAllForUser(user.id);
      await repos.audit.record({ actorId: actor.userId, action: "member.password_reset", entity: "User", entityId: user.id });
    });
  }

  /** Creates a login for an existing member, starting with the default password. */
  async createLogin(actor: Actor, memberId: string): Promise<void> {
    assertCan(actor, Permission.MANAGE_MEMBERS);
    const passwordHash = await this.defaultPasswordHash();
    await this.uow.run(async (repos) => {
      const member = await repos.members.findById(memberId);
      if (!member) throw new NotFoundError("Member");
      if (member.hasLogin) throw new RuleError("This member already has a login.");
      const user = await repos.users.create({
        name: member.fullName,
        email: member.email,
        phone: member.phone,
        passwordHash,
        role: Role.MEMBER,
        memberId,
        mustChangePassword: true,
      });
      await repos.audit.record({ actorId: actor.userId, action: "member.login_created", entity: "User", entityId: user.id });
    });
  }
}
