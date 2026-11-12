"use client";

import { useId } from "react";
import { PROOF_ACCEPT, PROOF_MAX_BYTES } from "@/lib/validation/proof";
import { useFieldError } from "./forms";
import { inputClass } from "./ui";

/** Required proof-of-payment upload, shared by the member and public payment forms. */
export function ProofInput() {
  const id = useId();
  const error = useFieldError("proof");
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">
        Proof of payment
      </label>
      <input
        id={id}
        name="proof"
        type="file"
        accept={PROOF_ACCEPT}
        required
        aria-invalid={Boolean(error)}
        className={`${inputClass} file:mr-3 file:rounded file:border-0 file:bg-brand-soft file:px-3 file:py-1 file:text-sm file:text-brand-strong`}
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          e.currentTarget.setCustomValidity(file && file.size > PROOF_MAX_BYTES ? "The file must be 4 MB or smaller." : "");
          e.currentTarget.reportValidity();
        }}
      />
      {error ? <p className="text-sm text-danger">{error}</p> : <p className="text-xs text-muted">Screenshot or PDF of the transfer receipt (max 4 MB). Required.</p>}
    </div>
  );
}
