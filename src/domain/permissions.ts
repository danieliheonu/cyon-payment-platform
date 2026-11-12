import { FinanceArea, Role } from "./enums";

/**
 * The single permission catalogue. Every check in the app — proxy, pages,
 * server actions, services, and UI button visibility — uses these values.
 *
 * Rule (CYON): only the Financial Officer may modify financial records.
 * A Super Admin may grant individual finance areas to an Admin (or to themselves),
 * which adds that area's permissions through a PermissionGrant row.
 */
export const Permission = {
  // Member self-service
  PAY_OWN: "payments.submit_own",
  VIEW_OWN_RECORDS: "records.view_own",

  // Staff read access
  VIEW_ALL_PAYMENTS: "payments.view_all",
  VIEW_REPORTS: "reports.view",
  VIEW_AUDIT: "audit.view",

  // Administration (non-financial)
  MANAGE_MEMBERS: "members.manage",
  MANAGE_CATEGORIES: "categories.manage",

  // Super Admin
  MANAGE_USERS: "users.manage",
  MANAGE_GRANTS: "grants.manage",

  // Finance — PAYMENTS area
  CONFIRM_PAYMENTS: "finance.payments.confirm",
  RECORD_CASH: "finance.payments.record_cash",
  CORRECT_PAYMENTS: "finance.payments.correct",
  // Finance — RATES_CHARGES area
  MANAGE_RATES: "finance.rates.manage",
  MANAGE_CHARGES: "finance.charges.manage",
  // Finance — BROUGHT_FORWARD area
  MANAGE_BROUGHT_FORWARD: "finance.brought_forward.manage",
  // Finance — LINKS_ACCOUNTS area
  MANAGE_PAYMENT_LINKS: "finance.links.manage",
  MANAGE_BANK_ACCOUNTS: "finance.bank_accounts.manage",
} as const;

export type Permission = (typeof Permission)[keyof typeof Permission];

/** Which permissions each grantable finance area carries. */
export const AREA_PERMISSIONS: Record<FinanceArea, readonly Permission[]> = {
  PAYMENTS: [Permission.CONFIRM_PAYMENTS, Permission.RECORD_CASH, Permission.CORRECT_PAYMENTS],
  RATES_CHARGES: [Permission.MANAGE_RATES, Permission.MANAGE_CHARGES],
  BROUGHT_FORWARD: [Permission.MANAGE_BROUGHT_FORWARD],
  LINKS_ACCOUNTS: [Permission.MANAGE_PAYMENT_LINKS, Permission.MANAGE_BANK_ACCOUNTS],
};

const ALL_FINANCE = Object.values(AREA_PERMISSIONS).flat();

const STAFF_READ: readonly Permission[] = [
  Permission.VIEW_ALL_PAYMENTS,
  Permission.VIEW_REPORTS,
  Permission.VIEW_AUDIT,
];

const ADMIN_BASE: readonly Permission[] = [
  ...STAFF_READ,
  Permission.MANAGE_MEMBERS,
  Permission.MANAGE_CATEGORIES,
];

/** Permissions each role has without any grant. Note: no finance permissions for ADMIN / SUPER_ADMIN. */
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  MEMBER: [Permission.PAY_OWN, Permission.VIEW_OWN_RECORDS],
  FINANCIAL_OFFICER: [...STAFF_READ, ...ALL_FINANCE],
  ADMIN: ADMIN_BASE,
  SUPER_ADMIN: [...ADMIN_BASE, Permission.MANAGE_USERS, Permission.MANAGE_GRANTS],
};

/** Roles that may receive finance grants. */
export const GRANTABLE_ROLES: readonly Role[] = [Role.ADMIN, Role.SUPER_ADMIN];

export const STAFF_ROLES: readonly Role[] = [Role.FINANCIAL_OFFICER, Role.ADMIN, Role.SUPER_ADMIN];

export function isStaffRole(role: Role): boolean {
  return STAFF_ROLES.includes(role);
}

export function isGrantActive(
  grant: { revokedAt: Date | null; expiresAt: Date | null },
  now: Date,
): boolean {
  return grant.revokedAt === null && (grant.expiresAt === null || grant.expiresAt > now);
}

export function permissionsForArea(area: FinanceArea): readonly Permission[] {
  return AREA_PERMISSIONS[area];
}

/** The finance area a permission belongs to, if any. */
export function areaOf(permission: Permission): FinanceArea | null {
  for (const area of Object.values(FinanceArea)) {
    if (AREA_PERMISSIONS[area].includes(permission)) return area;
  }
  return null;
}
