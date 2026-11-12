import { can, type Actor } from "@/domain/actor";
import { Permission } from "@/domain/permissions";

export interface NavItem {
  href: string;
  label: string;
  /** Shown only to users who have this permission. */
  permission: Permission;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

/** Single navigation definition. Each user sees only what their permissions allow. */
export const NAVIGATION: NavSection[] = [
  {
    title: "My account",
    items: [
      { href: "/dashboard", label: "Dashboard", permission: Permission.VIEW_OWN_RECORDS },
      { href: "/pay", label: "Make a payment", permission: Permission.PAY_OWN },
      { href: "/history", label: "My payments", permission: Permission.VIEW_OWN_RECORDS },
    ],
  },
  {
    title: "Payments",
    items: [
      { href: "/staff", label: "Overview", permission: Permission.VIEW_REPORTS },
      { href: "/staff/payments", label: "All payments", permission: Permission.VIEW_ALL_PAYMENTS },
      { href: "/finance/confirmations", label: "Confirm payments", permission: Permission.CONFIRM_PAYMENTS },
      { href: "/finance/cash", label: "Record cash", permission: Permission.RECORD_CASH },
      { href: "/staff/members", label: "Members", permission: Permission.VIEW_ALL_PAYMENTS },
      { href: "/staff/payment-links", label: "Payment links", permission: Permission.VIEW_REPORTS },
      { href: "/staff/reports", label: "Reports", permission: Permission.VIEW_REPORTS },
    ],
  },
  {
    title: "Finance setup",
    items: [
      { href: "/finance/rates", label: "Dues & levy rates", permission: Permission.VIEW_REPORTS },
      { href: "/staff/charges", label: "Charges", permission: Permission.VIEW_REPORTS },
      { href: "/finance/brought-forward", label: "Brought forward", permission: Permission.VIEW_REPORTS },
      { href: "/finance/bank-accounts", label: "Bank accounts", permission: Permission.VIEW_REPORTS },
    ],
  },
  {
    title: "Administration",
    items: [
      { href: "/admin/categories", label: "Payment categories", permission: Permission.MANAGE_CATEGORIES },
      { href: "/admin/users", label: "Users & roles", permission: Permission.MANAGE_USERS },
      { href: "/admin/access", label: "Finance access", permission: Permission.MANAGE_GRANTS },
      { href: "/admin/audit", label: "Audit log", permission: Permission.VIEW_AUDIT },
    ],
  },
];

export function navigationFor(actor: Actor): NavSection[] {
  return NAVIGATION.map((section) => ({ ...section, items: section.items.filter((item) => can(actor, item.permission)) })).filter(
    (section) => section.items.length > 0,
  );
}
