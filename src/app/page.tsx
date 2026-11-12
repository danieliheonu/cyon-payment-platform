import { Suspense } from "react";
import { redirect } from "next/navigation";
import { currentActor, homePathFor } from "@/server/auth/session";

/** Sends people to the right home page for their role. */
export default function Home() {
  return (
    <Suspense>
      <RedirectHome />
    </Suspense>
  );
}

async function RedirectHome(): Promise<null> {
  const actor = await currentActor();
  redirect(actor ? homePathFor(actor) : "/login");
}
