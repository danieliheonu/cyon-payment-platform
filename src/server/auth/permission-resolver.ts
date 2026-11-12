import type { FinanceArea, Role } from "@/domain/enums";
import {
  GRANTABLE_ROLES,
  ROLE_PERMISSIONS,
  isGrantActive,
  permissionsForArea,
  type Permission,
} from "@/domain/permissions";

export interface PermissionSubject {
  id: string;
  role: Role;
}

/** A source of permissions. New sources plug in without changing the resolver (Open/Closed). */
export interface PermissionSource {
  permissionsFor(subject: PermissionSubject, now: Date): Promise<readonly Permission[]>;
}

export class RolePermissionSource implements PermissionSource {
  async permissionsFor(subject: PermissionSubject): Promise<readonly Permission[]> {
    return ROLE_PERMISSIONS[subject.role];
  }
}

export interface GrantRecord {
  area: FinanceArea;
  expiresAt: Date | null;
  revokedAt: Date | null;
}

export interface GrantReader {
  grantsForUser(userId: string): Promise<GrantRecord[]>;
}

/**
 * Finance permissions from Super Admin grants. Read from the database on every
 * request, so revocation and expiry take effect immediately.
 */
export class GrantPermissionSource implements PermissionSource {
  constructor(private readonly grants: GrantReader) {}

  async permissionsFor(subject: PermissionSubject, now: Date): Promise<readonly Permission[]> {
    if (!GRANTABLE_ROLES.includes(subject.role)) return [];
    const grants = await this.grants.grantsForUser(subject.id);
    return grants.filter((g) => isGrantActive(g, now)).flatMap((g) => permissionsForArea(g.area));
  }
}

export class PermissionResolver {
  constructor(private readonly sources: readonly PermissionSource[]) {}

  async resolve(subject: PermissionSubject, now: Date): Promise<ReadonlySet<Permission>> {
    const lists = await Promise.all(this.sources.map((s) => s.permissionsFor(subject, now)));
    return new Set(lists.flat());
  }
}
