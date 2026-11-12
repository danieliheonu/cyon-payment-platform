/** The result every form receives from its server action (rendered by <ActionForm>). */
export type ActionState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
  /** Extra values to show once, e.g. a temporary password or a status link. */
  data?: Record<string, string>;
} | null;
