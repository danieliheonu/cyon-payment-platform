"use server";

import { redirect } from "next/navigation";
import { checkBotId } from "botid/server";
import { guestTransferSchema, memberTransferSchema } from "@/lib/validation/schemas";
import { services } from "@/server/container";
import { fileFromForm, handleAction, type ActionState } from "@/server/http/action";
import { clientIp } from "@/server/http/client-ip";
import { requireActor } from "@/server/auth/session";

/** Member reports a bank transfer with proof. */
export async function submitMemberTransferAction(_s: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  let paymentId: string | null = null;
  const result = await handleAction(memberTransferSchema, formData, async (input) => {
    const proof = await fileFromForm(formData, "proof");
    paymentId = (await services().submissions.submitMemberTransfer(actor, input, proof)).id;
  });
  if (result?.ok && paymentId) redirect(`/payments/${paymentId}?submitted=1`);
  return result;
}

/** Public payment link submission (no login). Protected by Vercel BotID. */
export async function submitLinkTransferAction(_s: ActionState, formData: FormData): Promise<ActionState> {
  const verification = await checkBotId();
  if (verification.isBot) return { ok: false, message: "We couldn't verify this request. Please try again." };

  const slug = String(formData.get("slug") ?? "");
  let destination: string | null = null;
  const result = await handleAction(guestTransferSchema, formData, async (input) => {
    const proof = await fileFromForm(formData, "proof");
    const { statusToken } = await services().submissions.submitLinkTransfer(slug, input, proof, await clientIp());
    destination = `/p/${slug}/s/${statusToken}`;
  });
  if (result?.ok && destination) redirect(destination);
  return result;
}
