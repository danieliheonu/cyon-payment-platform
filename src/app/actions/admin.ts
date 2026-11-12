"use server";

import { z } from "zod";
import {
  categorySchema,
  changeRoleSchema,
  grantSchema,
  memberSchema,
  memberUpdateSchema,
  revokeSchema,
  setActiveSchema,
  staffUserSchema,
} from "@/lib/validation/schemas";
import { id } from "@/lib/validation/fields";
import { services } from "@/server/container";
import { handleAction, type ActionState } from "@/server/http/action";
import { requireActor } from "@/server/auth/session";

// ───────────── Members (Admin) ─────────────

export async function createMemberAction(_s: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  return handleAction(memberSchema, formData, async (input) => {
    const member = await services().members.create(actor, input);
    const login = member.hasLogin ? await services().members.login(actor, member.id) : null;
    return {
      ok: true,
      message: `${member.fullName} added.`,
      data: {
        memberId: member.id,
        ...(login?.defaultPassword
          ? { memberName: member.fullName, identifier: login.identifier, password: login.defaultPassword, phone: login.phone ?? "" }
          : {}),
      },
    };
  });
}

export async function updateMemberAction(_s: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  return handleAction(memberUpdateSchema.extend({ memberId: id }), formData, async ({ memberId, ...input }) => {
    await services().members.update(actor, memberId, input);
    return { ok: true, message: "Member updated." };
  });
}

export async function createMemberLoginAction(_s: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  return handleAction(z.object({ memberId: id }), formData, async ({ memberId }) => {
    await services().members.createLogin(actor, memberId);
    return { ok: true, message: "Login created. Share the login details below." };
  });
}

export async function resetMemberLoginAction(_s: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  return handleAction(z.object({ memberId: id }), formData, async ({ memberId }) => {
    await services().members.resetLogin(actor, memberId);
    return { ok: true, message: "Password reset to the default. Share the login details below." };
  });
}

export async function resetPasswordAction(_s: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  return handleAction(z.object({ userId: id }), formData, async ({ userId }) => {
    const temporaryPassword = await services().access.resetPassword(actor, userId);
    return { ok: true, message: "Password reset.", data: { temporaryPassword } };
  });
}

// ───────────── Categories (Admin) ─────────────

export async function saveCategoryAction(_s: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  return handleAction(categorySchema.extend({ categoryId: z.string().optional() }), formData, async ({ categoryId, ...input }) => {
    if (categoryId) await services().categories.update(actor, categoryId, input);
    else await services().categories.create(actor, input);
    return { ok: true, message: categoryId ? "Category updated." : "Category added." };
  });
}

// ───────────── Users & finance access (Super Admin) ─────────────

export async function createStaffUserAction(_s: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  return handleAction(staffUserSchema, formData, async (input) => {
    const { user, temporaryPassword } = await services().access.createStaffUser(actor, input);
    return { ok: true, message: `Account created for ${user.name}.`, data: { temporaryPassword } };
  });
}

export async function changeRoleAction(_s: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  return handleAction(changeRoleSchema, formData, async (input) => {
    await services().access.changeRole(actor, input.userId, input.role, input.reason);
    return { ok: true, message: "Role updated." };
  });
}

export async function setActiveAction(_s: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  return handleAction(setActiveSchema, formData, async (input) => {
    await services().access.setActive(actor, input.userId, input.active, input.reason);
    return { ok: true, message: input.active ? "Account activated." : "Account deactivated." };
  });
}

export async function grantAction(_s: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  return handleAction(
    grantSchema,
    formData,
    async (input) => {
      const grants = await services().access.grant(actor, input);
      return { ok: true, message: `Granted ${grants.length} area${grants.length === 1 ? "" : "s"}.` };
    },
    { arrayKeys: ["areas"] },
  );
}

export async function revokeAction(_s: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  return handleAction(revokeSchema, formData, async (input) => {
    await services().access.revoke(actor, input.grantId, input.reason);
    return { ok: true, message: "Access revoked." };
  });
}
