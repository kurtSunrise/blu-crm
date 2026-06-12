"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

export function SignInForm({ microsoftSso }: { microsoftSso: boolean }) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsPending(true);
    setError(null);

    const formData = new FormData(event.currentTarget);
    const { error: signInError } = await authClient.signIn.email({
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
    });

    if (signInError) {
      setError(
        signInError.message ?? "Sign-in failed. Check your email and password."
      );
      setIsPending(false);
      return;
    }
    router.push("/");
    router.refresh();
  };

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
      <div className="flex flex-col gap-2">
        <Label htmlFor="sign-in-email">Email</Label>
        <Input
          autoComplete="email"
          autoFocus
          className="h-12"
          id="sign-in-email"
          name="email"
          placeholder="you@blu.builders"
          required
          type="email"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="sign-in-password">Password</Label>
        <Input
          autoComplete="current-password"
          className="h-12"
          id="sign-in-password"
          name="password"
          required
          type="password"
        />
      </div>
      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}
      <Button className="h-12 text-base" disabled={isPending} type="submit">
        {isPending ? "Signing in…" : "Sign in"}
      </Button>
      {microsoftSso && (
        <Button
          className="h-12 text-base"
          disabled={isPending}
          onClick={() => authClient.signIn.social({ provider: "microsoft" })}
          type="button"
          variant="secondary"
        >
          Sign in with Microsoft 365
        </Button>
      )}
    </form>
  );
}
