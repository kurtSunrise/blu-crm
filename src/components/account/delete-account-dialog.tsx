"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

// Permanently deletes the signed-in member's account. Confirming requires the
// current password (deleteUser is enabled server-side with no email step), and
// the member is sent to sign-in once it's gone.
export function DeleteAccountDialog({ email }: { email: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!password) {
      setError("Enter your password to confirm.");
      return;
    }

    setError(null);
    setIsPending(true);
    const { error: deleteError } = await authClient.deleteUser({ password });
    setIsPending(false);

    if (deleteError) {
      setError(deleteError.message ?? "Could not delete your account.");
      return;
    }
    router.push("/sign-in");
    router.refresh();
  };

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) {
          setPassword("");
          setError(null);
        }
      }}
      open={open}
    >
      <DialogTrigger
        render={
          <Button className="h-10 px-4" type="button" variant="destructive" />
        }
      >
        Delete Account
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Delete account</DialogTitle>
        <DialogDescription>
          This permanently deletes the account for{" "}
          <span className="font-medium text-foreground">{email}</span> and all
          of its data. This cannot be undone.
        </DialogDescription>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="delete-password">Confirm with your password</Label>
            <Input
              autoComplete="current-password"
              id="delete-password"
              name="password"
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </div>
          {error && (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <DialogClose
              render={
                <Button
                  className="h-11 flex-1"
                  type="button"
                  variant="secondary"
                />
              }
            >
              Cancel
            </DialogClose>
            <Button
              className="h-11 flex-1"
              disabled={isPending}
              type="submit"
              variant="destructive"
            >
              {isPending ? "Deleting…" : "Delete account"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
