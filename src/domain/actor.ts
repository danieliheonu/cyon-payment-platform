import type { Role } from "./enums";
import { ForbiddenError } from "./errors";
import { Permission } from "./permissions";

/** The signed-in user performing an action, with their effective permissions resolved. */
export interface Actor {
  userId: string;
  role: Role;
  memberId: string | null;
  displayName: string;
  permissions: ReadonlySet<Permission>;
}

export function can(actor: Actor, permission: Permission): boolean {
  return actor.permissions.has(permission);
}

export function assertCan(actor: Actor, permission: Permission): void {
  if (!can(actor, permission)) throw new ForbiddenError();
}

/** Members may only see their own records; staff with VIEW_ALL_PAYMENTS may see anyone's. */
export function canViewMemberRecords(actor: Actor, memberId: string | null): boolean {
  if (can(actor, Permission.VIEW_ALL_PAYMENTS)) return true;
  return memberId !== null && actor.memberId === memberId && can(actor, Permission.VIEW_OWN_RECORDS);
}

export function assertCanViewMemberRecords(actor: Actor, memberId: string | null): void {
  if (!canViewMemberRecords(actor, memberId)) throw new ForbiddenError();
}
