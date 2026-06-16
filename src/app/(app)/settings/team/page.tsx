import { asc } from "drizzle-orm";
import { Users } from "lucide-react";
import { SettingsSection } from "@/components/settings-section";
import { type TeamMember, TeamMembers } from "@/components/team/team-members";
import { db } from "@/db";
import { user } from "@/db/schema";
import { requireSession } from "@/lib/session";

export const metadata = {
  title: "Settings · Team | Blu CRM",
};

export const dynamic = "force-dynamic";

export default async function TeamSettingsPage() {
  const session = await requireSession();
  const members = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      image: user.image,
      disabled: user.disabled,
    })
    .from(user)
    .orderBy(asc(user.name));

  // The role column is stored as free text; narrow it to the two roles the UI
  // knows about so anything unexpected is treated as the least-privileged.
  const normalizedMembers: TeamMember[] = members.map((member) => ({
    ...member,
    role: member.role === "admin" ? "admin" : "sales",
  }));

  const isAdmin = session.user.role === "admin";

  const description = isAdmin
    ? "Everyone with access to this workspace. Add members, change roles, and disable accounts. There is no public sign-up."
    : "Everyone with access to this workspace. Accounts are created by the admin; there is no public sign-up.";

  return (
    <SettingsSection
      description={description}
      icon={Users}
      title="Team members"
    >
      <TeamMembers
        currentUserId={session.user.id}
        isAdmin={isAdmin}
        members={normalizedMembers}
      />
    </SettingsSection>
  );
}
