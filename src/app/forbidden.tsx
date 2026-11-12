import { LinkButton } from "@/components/ui";

export default function Forbidden() {
  return (
    <div className="mx-auto max-w-md py-24 text-center">
      <h1 className="text-2xl font-semibold">You don&apos;t have access to this page</h1>
      <p className="mt-2 text-sm text-muted">
        Financial records can only be changed by the Financial Officer, or by an admin the Super Admin has given access to.
      </p>
      <LinkButton href="/" className="mt-6">
        Go to my home page
      </LinkButton>
    </div>
  );
}
