import { redirect } from "next/navigation";
import { BrandMark } from "@/components/brand-mark";
import { SignInForm } from "@/components/sign-in-form";
import { isMicrosoftSsoEnabled } from "@/lib/auth";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Sign in | Blu CRM",
};

export default async function SignInPage() {
  // Temporary sign-in hang diagnosis (see [auth-debug] marks in session.ts).
  console.log("[auth-debug] sign-in render start");
  const session = await getSession();
  console.log("[auth-debug] sign-in render after getSession");
  if (session) {
    redirect("/");
  }

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-10">
      <header className="flex flex-col gap-2">
        <BrandMark className="block" priority size={48} />
        <h1 className="font-heading font-semibold text-2xl tracking-tight">
          Sign in to Blu CRM
        </h1>
        <p className="text-muted-foreground text-sm">
          The pipeline, follow-ups, and client history for the Blu sales team.
        </p>
      </header>
      <SignInForm microsoftSso={isMicrosoftSsoEnabled} />
      <p className="text-muted-foreground text-xs">
        Private and Confidential · Blu.Builders Pty Ltd
      </p>
    </main>
  );
}
