"use client";

import { createContext, startTransition, useActionState, useContext, useEffect, useId, useRef, useState, type ComponentProps, type FormEvent, type ReactNode } from "react";
import type { ActionState } from "@/lib/action-state";
import { Alert, Button, cx, inputClass, type ButtonVariant } from "./ui";

/** Form state shared with fields so each field shows its own error (one mechanism for all forms). */
const FormStateContext = createContext<{ state: ActionState; pending: boolean }>({ state: null, pending: false });

type Action = (state: ActionState, formData: FormData) => Promise<ActionState>;

export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess = false,
  showSuccess = true,
  successContent,
}: {
  action: Action;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  showSuccess?: boolean;
  /** Renders extra content after success (e.g. a temporary password). */
  successContent?: (state: NonNullable<ActionState>) => ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok && resetOnSuccess) formRef.current?.reset();
  }, [state, resetOnSuccess]);

  // Submitting through a transition (instead of <form action>) keeps what the user typed
  // when validation fails — React would otherwise reset the form after every action.
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  }

  return (
    <FormStateContext.Provider value={{ state, pending }}>
      <form ref={formRef} onSubmit={onSubmit} className={cx("space-y-4", className)} noValidate>
        {state && !state.ok && state.message ? <Alert tone="danger">{state.message}</Alert> : null}
        {state?.ok && showSuccess && state.message ? <Alert tone="success">{state.message}</Alert> : null}
        {state?.ok && successContent ? successContent(state) : null}
        {children}
      </form>
    </FormStateContext.Provider>
  );
}

export function useFieldError(name: string): string | undefined {
  return useContext(FormStateContext).state?.fieldErrors?.[name];
}

function FieldShell({ name, label, hint, children }: { name: string; label: string; hint?: ReactNode; children: (id: string, error?: string) => ReactNode }) {
  const id = useId();
  const error = useFieldError(name);
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      {children(id, error)}
      {error ? (
        <p id={`${id}-error`} className="text-sm text-danger">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export function TextField({ name, label, hint, className, ...props }: ComponentProps<"input"> & { name: string; label: string; hint?: ReactNode }) {
  return (
    <FieldShell name={name} label={label} hint={hint}>
      {(id, error) => (
        <input id={id} name={name} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} className={cx(inputClass, className)} {...props} />
      )}
    </FieldShell>
  );
}

/** Password input with a show/hide toggle. Used for every password field. */
export function PasswordField({ name, label, hint, className, ...props }: Omit<ComponentProps<"input">, "type"> & { name: string; label: string; hint?: ReactNode }) {
  const [visible, setVisible] = useState(false);
  return (
    <FieldShell name={name} label={label} hint={hint}>
      {(id, error) => (
        <div className="relative">
          <input
            id={id}
            name={name}
            type={visible ? "text" : "password"}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? `${id}-error` : undefined}
            className={cx(inputClass, "pr-10", className)}
            {...props}
          />
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? "Hide password" : "Show password"}
            aria-controls={id}
            title={visible ? "Hide password" : "Show password"}
            className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
          >
            <EyeIcon crossed={visible} />
          </button>
        </div>
      )}
    </FieldShell>
  );
}

/** Eye icon; `crossed` shows the "hide" (eye with a slash) variant. */
function EyeIcon({ crossed }: { crossed: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {crossed ? (
        <>
          <path d="M10.7 5.1A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-2.6 3.5" />
          <path d="M6.6 6.6A17.4 17.4 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6" />
          <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
          <path d="m2 2 20 20" />
        </>
      ) : (
        <>
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
          <circle cx="12" cy="12" r="3" />
        </>
      )}
    </svg>
  );
}

export function TextArea({ name, label, hint, ...props }: ComponentProps<"textarea"> & { name: string; label: string; hint?: ReactNode }) {
  return (
    <FieldShell name={name} label={label} hint={hint}>
      {(id, error) => <textarea id={id} name={name} rows={3} aria-invalid={Boolean(error)} className={inputClass} {...props} />}
    </FieldShell>
  );
}

export interface Option {
  value: string;
  label: string;
}

export function SelectField({ name, label, hint, options, placeholder, ...props }: ComponentProps<"select"> & { name: string; label: string; hint?: ReactNode; options: Option[]; placeholder?: string }) {
  return (
    <FieldShell name={name} label={label} hint={hint}>
      {(id, error) => (
        <select id={id} name={name} aria-invalid={Boolean(error)} className={inputClass} {...props}>
          {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </FieldShell>
  );
}

/** `showError={false}` when several boxes share a name and the group shows the error once. */
export function Checkbox({ name, label, hint, value, showError = true, ...props }: ComponentProps<"input"> & { name: string; label: ReactNode; hint?: ReactNode; showError?: boolean }) {
  const fieldError = useFieldError(name);
  const error = showError ? fieldError : undefined;
  return (
    <div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name={name} value={value} className="mt-0.5 h-4 w-4 accent-[var(--brand)]" {...props} />
        <span>
          {label}
          {hint ? <span className="block text-xs text-muted">{hint}</span> : null}
        </span>
      </label>
      {error ? <p className="mt-1 text-sm text-danger">{error}</p> : null}
    </div>
  );
}

/**
 * A searchable list of checkboxes sharing one name (each ticked value is submitted).
 * Large tap targets for phones; options hidden by the search stay ticked and are still submitted.
 */
export function CheckboxList({ name, label, options, searchPlaceholder = "Search…" }: { name: string; label: string; options: Option[]; searchPlaceholder?: string }) {
  const error = useFieldError(name);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const needle = query.trim().toLowerCase();
  const matches = (o: Option) => !needle || o.label.toLowerCase().includes(needle);
  const shown = options.filter(matches);

  const toggle = (value: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(value);
      else next.delete(value);
      return next;
    });

  return (
    <fieldset className="space-y-2">
      <legend className="mb-1.5 block text-sm font-medium">{label}</legend>
      <input type="search" aria-label={`Search ${label.toLowerCase()}`} placeholder={searchPlaceholder} value={query} onChange={(e) => setQuery(e.target.value)} className={inputClass} />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted" aria-live="polite">
          {selected.size} of {options.length} selected
        </span>
        <span className="ml-auto flex gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={() => setSelected((prev) => new Set([...prev, ...shown.map((o) => o.value)]))} disabled={shown.length === 0}>
            {needle ? "Select shown" : "Select all"}
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={() => setSelected(new Set())} disabled={selected.size === 0}>
            Clear
          </Button>
        </span>
      </div>
      <div className="max-h-80 divide-y divide-border overflow-y-auto rounded-md border border-border" aria-invalid={Boolean(error)}>
        {options.map((o) => (
          <label key={o.value} className={cx("flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-surface-muted", !matches(o) && "hidden")}>
            <input type="checkbox" name={name} value={o.value} checked={selected.has(o.value)} onChange={(e) => toggle(o.value, e.target.checked)} className="h-5 w-5 shrink-0 accent-[var(--brand)]" />
            <span>{o.label}</span>
          </label>
        ))}
        {shown.length === 0 ? <p className="px-3 py-3 text-sm text-muted">No matches.</p> : null}
      </div>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </fieldset>
  );
}

export function SubmitButton({ children, variant = "primary", pendingText = "Saving…", className }: { children: ReactNode; variant?: ButtonVariant; pendingText?: string; className?: string }) {
  const { pending } = useContext(FormStateContext);
  return (
    <Button type="submit" variant={variant} disabled={pending} aria-busy={pending} className={className}>
      {pending ? pendingText : children}
    </Button>
  );
}

/** One-time key per form so double clicks or resubmits never record a payment twice. */
export function IdempotencyKey() {
  const [key] = useState(() => crypto.randomUUID());
  return <input type="hidden" name="idempotencyKey" value={key} />;
}

export function Hidden({ name, value }: { name: string; value: string }) {
  return <input type="hidden" name={name} value={value} />;
}

/** Shows a one-time secret (temporary password, private link) after a successful action. */
export function OneTimeValue({ label, value, note }: { label: string; value: string; note?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Alert tone="warning" title={label}>
      <div className="flex flex-wrap items-center gap-2">
        <code className="rounded bg-surface px-2 py-1 font-mono text-sm break-all">{value}</code>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => {
            void navigator.clipboard.writeText(value);
            setCopied(true);
          }}
        >
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      {note ? <p className="mt-2 text-xs">{note}</p> : null}
    </Alert>
  );
}

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      onClick={() => {
        void navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? "Copied" : label}
    </Button>
  );
}
