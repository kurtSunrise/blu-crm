"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { addTeamMember } from "@/lib/actions/team-actions";

const MIN_PASSWORD_LENGTH = 8;

type MemberRole = "admin" | "sales";

// Admin-only dialog to create a new member. The backend inserts the user and
// credential rows directly (no sign-up flow), so the admin sets an initial
// password here and shares it with the member out of band.
export function AddMemberDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<MemberRole>("sales");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const resetFields = () => {
    setName("");
    setEmail("");
    setRole("sales");
    setPassword("");
    setError(null);
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await addTeamMember({
        name: name.trim(),
        email: email.trim(),
        role,
        password,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      resetFields();
      setOpen(false);
      router.refresh();
    });
  };

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) {
          resetFields();
        }
      }}
      open={open}
    >
      <DialogTrigger render={<Button className="h-11 px-4" type="button" />}>
        Add member
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Add team member</DialogTitle>
        <DialogDescription>
          Create an account for a teammate. You share the initial password with
          them; they can change it later in Account settings.
        </DialogDescription>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-member-name">Name</Label>
            <Input
              autoComplete="name"
              className="h-11"
              id="new-member-name"
              name="name"
              onChange={(event) => setName(event.target.value)}
              required
              value={name}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-member-email">Email</Label>
            <Input
              autoComplete="email"
              className="h-11"
              id="new-member-email"
              name="email"
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-member-role">Role</Label>
            <NativeSelect
              id="new-member-role"
              name="role"
              onChange={(event) => setRole(event.target.value as MemberRole)}
              value={role}
            >
              <option value="sales">Sales</option>
              <option value="admin">Admin</option>
            </NativeSelect>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-member-password">Initial password</Label>
            <Input
              autoComplete="new-password"
              className="h-11"
              id="new-member-password"
              minLength={MIN_PASSWORD_LENGTH}
              name="password"
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
            <p className="text-muted-foreground text-xs">
              At least {MIN_PASSWORD_LENGTH} characters. The member can change
              this later in Account settings.
            </p>
          </div>
          {error && (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <Button
              className="h-11 flex-1"
              disabled={isPending}
              onClick={() => setOpen(false)}
              type="button"
              variant="secondary"
            >
              Cancel
            </Button>
            <Button className="h-11 flex-1" disabled={isPending} type="submit">
              {isPending ? "Adding…" : "Add member"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
