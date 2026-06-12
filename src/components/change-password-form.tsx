"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

const MIN_PASSWORD_LENGTH = 8;

// Lets each team member replace the seeded initial password with their own
// (M0 auth). Other sessions are revoked on change, so a shared or leaked
// initial password stops working everywhere at once.
export function ChangePasswordForm() {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setDone(false);

    const form = event.currentTarget;
    const formData = new FormData(form);
    const newPassword = String(formData.get("newPassword") ?? "");
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setError(
        `The new password needs at least ${MIN_PASSWORD_LENGTH} characters.`
      );
      return;
    }
    if (newPassword !== String(formData.get("confirmPassword") ?? "")) {
      setError("The new passwords do not match.");
      return;
    }

    setIsPending(true);
    const { error: changeError } = await authClient.changePassword({
      currentPassword: String(formData.get("currentPassword") ?? ""),
      newPassword,
      revokeOtherSessions: true,
    });
    setIsPending(false);

    if (changeError) {
      setError(
        changeError.message ??
          "Password change failed. Check your current password."
      );
      return;
    }
    form.reset();
    setDone(true);
  };

  return (
    <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="current-password">Current password</Label>
        <Input
          autoComplete="current-password"
          id="current-password"
          name="currentPassword"
          required
          type="password"
        />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="new-password">New password</Label>
          <Input
            autoComplete="new-password"
            id="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            name="newPassword"
            required
            type="password"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="confirm-password">Confirm new password</Label>
          <Input
            autoComplete="new-password"
            id="confirm-password"
            minLength={MIN_PASSWORD_LENGTH}
            name="confirmPassword"
            required
            type="password"
          />
        </div>
      </div>
      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}
      {done && (
        <p className="text-blu text-sm" role="status">
          Password updated. Other signed-in devices have been signed out.
        </p>
      )}
      <Button className="w-fit" disabled={isPending} type="submit">
        {isPending ? "Updating…" : "Update password"}
      </Button>
    </form>
  );
}
