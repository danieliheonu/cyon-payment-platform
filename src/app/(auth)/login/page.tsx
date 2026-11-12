import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <>
      <h1 className="mb-1 text-lg font-semibold">Sign in</h1>
      <p className="mb-5 text-sm text-muted">Use the email or phone number registered with CYON.</p>
      <Suspense>
        <LoginForm next={searchParams.then((p) => (typeof p.next === "string" ? p.next : ""))} />
      </Suspense>
    </>
  );
}
