import "server-only";
import { can, type Actor } from "@/domain/actor";
import { PaymentMethod, PaymentStatus } from "@/domain/enums";
import { ForbiddenError, ValidationError } from "@/domain/errors";
import { Permission } from "@/domain/permissions";

/** Who is submitting: a signed-in member, a guest on a payment link, or finance staff. */
export type Channel = "MEMBER" | "LINK" | "STAFF";

export interface MethodDraft {
  bankAccountId: string | null;
  hasProof: boolean;
}

export interface MethodDecision {
  /** Status the payment is created with. */
  initialStatus: PaymentStatus;
  /** True when creation itself confirms the money (e.g. cash counted by an officer). */
  confirmsOnCreate: boolean;
}

/**
 * Strategy per payment method (Open/Closed): adding a gateway later means adding
 * a handler and a registry entry — submission and confirmation code stay the same.
 */
export interface PaymentMethodHandler {
  readonly method: PaymentMethod;
  decide(draft: MethodDraft, channel: Channel, actor: Actor | null): MethodDecision;
}

export const bankTransferHandler: PaymentMethodHandler = {
  method: PaymentMethod.BANK_TRANSFER,
  decide(draft) {
    const errors: Record<string, string> = {};
    if (!draft.bankAccountId) errors.bankAccountId = "Choose the account you paid into.";
    if (!draft.hasProof) errors.proof = "Proof of payment is required.";
    if (Object.keys(errors).length) throw new ValidationError("Some transfer details are missing.", errors);
    // Transfers stay pending until finance staff confirm the money arrived.
    return { initialStatus: PaymentStatus.PENDING, confirmsOnCreate: false };
  },
};

export const cashHandler: PaymentMethodHandler = {
  method: PaymentMethod.CASH,
  decide(_draft, channel, actor) {
    if (channel !== "STAFF" || !actor || !can(actor, Permission.RECORD_CASH)) {
      throw new ForbiddenError("Only finance staff can record cash.");
    }
    // The officer has the cash in hand: recording it is the confirmation.
    return { initialStatus: PaymentStatus.CONFIRMED, confirmsOnCreate: true };
  },
};

export class PaymentMethodRegistry {
  private readonly handlers = new Map<PaymentMethod, PaymentMethodHandler>();

  constructor(handlers: readonly PaymentMethodHandler[]) {
    for (const handler of handlers) this.handlers.set(handler.method, handler);
  }

  get(method: PaymentMethod): PaymentMethodHandler {
    const handler = this.handlers.get(method);
    if (!handler) throw new ValidationError("This payment method is not available.");
    return handler;
  }
}

export const defaultPaymentMethods = new PaymentMethodRegistry([bankTransferHandler, cashHandler]);
