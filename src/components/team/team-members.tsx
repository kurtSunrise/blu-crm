"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AddMemberDialog } from "@/components/team/add-member-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { setMemberDisabled, setMemberRole } from "@/lib/actions/team-actions";
import { getUserInitials } from "@/lib/user";
import { cn } from "@/lib/utils";

type MemberRole = "admin" | "sales";

export interface TeamMember {
  disabled: boolean;
  email: string;
  id: string;
  image: string | null;
  name: string;
  role: MemberRole;
}

export function TeamMembers({
  members,
  isAdmin,
  currentUserId,
}: {
  members: TeamMember[];
  isAdmin: boolean;
  currentUserId: string;
}) {
  return (
    <div className="flex flex-col gap-4">
      {isAdmin && (
        <div className="flex justify-end">
          <AddMemberDialog />
        </div>
      )}
      <ul className="flex flex-col gap-0 divide-y rounded-lg border bg-card">
        {members.map((member) => (
          <li key={member.id}>
            {isAdmin ? (
              <AdminMemberRow currentUserId={currentUserId} member={member} />
            ) : (
              <ReadOnlyMemberRow
                isYou={member.id === currentUserId}
                member={member}
              />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function MemberIdentity({
  member,
  isYou,
}: {
  member: TeamMember;
  isYou: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <Avatar className={cn(member.disabled && "opacity-60")}>
        {member.image ? (
          <AvatarImage alt={member.name} src={member.image} />
        ) : null}
        <AvatarFallback className="bg-primary font-medium text-primary-foreground">
          {getUserInitials(member.name, member.email)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "truncate font-medium text-sm",
            member.disabled && "text-muted-foreground"
          )}
        >
          {member.name}
          {isYou ? (
            <span className="ml-2 text-muted-foreground text-xs">You</span>
          ) : null}
        </p>
        <p className="truncate text-muted-foreground text-xs">{member.email}</p>
      </div>
    </div>
  );
}

function ReadOnlyMemberRow({
  member,
  isYou,
}: {
  member: TeamMember;
  isYou: boolean;
}) {
  return (
    <div className="flex items-center gap-3 p-4 sm:p-5">
      <div className="min-w-0 flex-1">
        <MemberIdentity isYou={isYou} member={member} />
      </div>
      {member.disabled && <Badge variant="outline">Disabled</Badge>}
      <Badge className="capitalize" variant="secondary">
        {member.role}
      </Badge>
    </div>
  );
}

function AdminMemberRow({
  member,
  currentUserId,
}: {
  member: TeamMember;
  currentUserId: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const isYou = member.id === currentUserId;

  const handleRoleChange = (nextRole: MemberRole) => {
    if (nextRole === member.role) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await setMemberRole({
        userId: member.id,
        role: nextRole,
      });
      if (result.ok) {
        router.refresh();
        return;
      }
      setError(result.error);
    });
  };

  const handleToggleDisabled = () => {
    setError(null);
    startTransition(async () => {
      const result = await setMemberDisabled({
        userId: member.id,
        disabled: !member.disabled,
      });
      if (result.ok) {
        router.refresh();
        return;
      }
      setError(result.error);
    });
  };

  const roleSelectId = `member-role-${member.id}`;

  return (
    <div className="flex flex-col gap-3 p-4 sm:p-5">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <MemberIdentity isYou={isYou} member={member} />
        </div>
        {member.disabled && <Badge variant="outline">Disabled</Badge>}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-36 flex-1 flex-col gap-1.5">
          <Label htmlFor={roleSelectId}>Role</Label>
          <NativeSelect
            disabled={isPending}
            id={roleSelectId}
            onChange={(event) =>
              handleRoleChange(event.target.value as MemberRole)
            }
            value={member.role}
          >
            <option value="sales">Sales</option>
            <option value="admin">Admin</option>
          </NativeSelect>
        </div>
        <Button
          className="h-11"
          disabled={isPending}
          onClick={handleToggleDisabled}
          type="button"
          variant={member.disabled ? "outline" : "destructive"}
        >
          {member.disabled ? "Enable" : "Disable"}
        </Button>
      </div>
      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
