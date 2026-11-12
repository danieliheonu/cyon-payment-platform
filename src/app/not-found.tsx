import { LinkButton } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md py-24 text-center">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="mt-2 text-sm text-muted">The link may be wrong or the record may no longer exist.</p>
      <LinkButton href="/" className="mt-6">
        Go home
      </LinkButton>
    </div>
  );
}
