"use client";

import { Button } from "@/components/ui";

/** Unexpected errors: a calm message and a retry. Details stay in the server logs. */
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-md py-24 text-center">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="mt-2 text-sm text-muted">Nothing was saved twice — it is safe to try again. If this keeps happening, contact the CYON administrator.</p>
      <Button className="mt-6" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
