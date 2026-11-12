"use client";

import { whatsappShareUrl } from "@/lib/contact";
import { CopyButton } from "./forms";
import { buttonClass } from "./ui";

/** The message an admin sends a member with their sign-in details. */
export function loginDetailsMessage(d: { memberName: string; orgName: string; signInUrl: string; identifier: string; password: string }): string {
  return [
    `Hello ${d.memberName}, your ${d.orgName} payment account is ready.`,
    "",
    `Sign in: ${d.signInUrl}`,
    `Phone/email: ${d.identifier}`,
    `Password: ${d.password}`,
    "",
    "You'll be asked to choose your own password when you first sign in.",
  ].join("\n");
}

/** Login details with Copy and WhatsApp share (opens a chat with the member's number). */
export function LoginDetailsShare(props: { memberName: string; orgName: string; signInUrl: string; identifier: string; password: string; phone: string | null }) {
  const message = loginDetailsMessage(props);
  return (
    <div className="space-y-3">
      <pre className="rounded-md border border-border bg-background p-3 font-sans text-sm whitespace-pre-wrap break-words">{message}</pre>
      <div className="flex flex-wrap gap-2">
        <CopyButton value={message} label="Copy login details" />
        <a className={buttonClass("secondary", "sm")} href={whatsappShareUrl(message, props.phone)} target="_blank" rel="noopener noreferrer">
          Share on WhatsApp
        </a>
      </div>
    </div>
  );
}
