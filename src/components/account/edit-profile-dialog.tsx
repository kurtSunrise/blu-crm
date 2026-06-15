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

// Updates the signed-in member's display name. Email changes need a separate
// verification flow, so they're out of scope here.
export function EditProfileDialog({ name }: { name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(name);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) {
      setError("Enter your name.");
      return;
    }

    setError(null);
    setIsPending(true);
    const { error: updateError } = await authClient.updateUser({
      name: trimmed,
    });
    setIsPending(false);

    if (updateError) {
      setError(updateError.message ?? "Could not update your profile.");
      return;
    }
    setOpen(false);
    router.refresh();
  };

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) {
          setValue(name);
          setError(null);
        }
      }}
      open={open}
    >
      <DialogTrigger
        render={
          <Button className="h-10 px-4" type="button" variant="outline" />
        }
      >
        Edit Profile
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Edit profile</DialogTitle>
        <DialogDescription>Update your display name.</DialogDescription>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="profile-name">Name</Label>
            <Input
              autoComplete="name"
              id="profile-name"
              name="name"
              onChange={(event) => setValue(event.target.value)}
              required
              value={value}
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
            <Button className="h-11 flex-1" disabled={isPending} type="submit">
              {isPending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
