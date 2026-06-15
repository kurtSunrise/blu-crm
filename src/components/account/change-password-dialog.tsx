"use client";

import { ChangePasswordForm } from "@/components/change-password-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

// Wraps the shared password form in a dialog so it matches the Account page's
// button-led layout. The form revokes other sessions on success and shows its
// own confirmation, so the dialog stays open until the member closes it.
export function ChangePasswordDialog() {
  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button className="h-10 px-4" type="button" variant="outline" />
        }
      >
        Change Password
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Change password</DialogTitle>
        <DialogDescription>
          Choose a new password. Other signed-in devices are signed out when it
          changes.
        </DialogDescription>
        <ChangePasswordForm />
      </DialogContent>
    </Dialog>
  );
}
