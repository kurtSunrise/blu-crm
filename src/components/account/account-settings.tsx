"use client";

import { KeyRound, TriangleAlert, User } from "lucide-react";
import { ChangePasswordDialog } from "@/components/account/change-password-dialog";
import { DeleteAccountDialog } from "@/components/account/delete-account-dialog";
import { EditProfileDialog } from "@/components/account/edit-profile-dialog";
import { LogOutAllButton } from "@/components/account/log-out-all-button";
import { SessionsDialog } from "@/components/account/sessions-dialog";
import { SettingsPanel, SettingsSection } from "@/components/settings-section";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getUserInitials } from "@/lib/user";

interface AccountUser {
  email: string;
  image: string | null;
  name: string;
}

// A label/description on the left with an action control on the right; used for
// the Security and Danger Zone rows.
function ActionRow({
  title,
  description,
  children,
  tone = "default",
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  tone?: "default" | "danger";
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="font-medium text-sm">{title}</p>
        <p
          className={
            tone === "danger"
              ? "text-destructive/80 text-xs"
              : "text-muted-foreground text-xs"
          }
        >
          {description}
        </p>
      </div>
      {children}
    </div>
  );
}

export function AccountSettings({ user }: { user: AccountUser }) {
  const initials = getUserInitials(user.name, user.email);

  return (
    <>
      <SettingsSection
        description="Your personal information"
        icon={User}
        title="Profile"
      >
        <SettingsPanel>
          <div className="flex items-center gap-4">
            <Avatar size="lg">
              {user.image ? (
                <AvatarImage alt={user.name} src={user.image} />
              ) : null}
              <AvatarFallback className="bg-primary font-medium text-primary-foreground">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate font-medium">{user.name}</p>
              <p className="truncate text-muted-foreground text-sm">
                {user.email}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <EditProfileDialog name={user.name} />
            <ChangePasswordDialog />
          </div>
        </SettingsPanel>
      </SettingsSection>

      <SettingsSection
        description="Manage your sessions and devices"
        icon={KeyRound}
        title="Security"
      >
        <SettingsPanel className="gap-0 divide-y p-0">
          <div className="p-4 sm:p-5">
            <ActionRow
              description="View and manage your active sessions across devices"
              title="Active sessions"
            >
              <SessionsDialog />
            </ActionRow>
          </div>
          <div className="p-4 sm:p-5">
            <ActionRow
              description="Sign out from all devices and browsers"
              title="Log out of all devices"
            >
              <LogOutAllButton />
            </ActionRow>
          </div>
        </SettingsPanel>
      </SettingsSection>

      <SettingsSection
        description="Irreversible actions for your account"
        icon={TriangleAlert}
        title="Danger Zone"
        tone="danger"
      >
        <SettingsPanel className="border-destructive/30 bg-destructive/5">
          <ActionRow
            description="Permanently delete your account and all data"
            title="Delete account"
            tone="danger"
          >
            <DeleteAccountDialog email={user.email} />
          </ActionRow>
        </SettingsPanel>
      </SettingsSection>
    </>
  );
}
