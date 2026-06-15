import { asc } from "drizzle-orm";
import { Users } from "lucide-react";
import { SettingsPanel, SettingsSection } from "@/components/settings-section";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { db } from "@/db";
import { user } from "@/db/schema";
import { requireSession } from "@/lib/session";
import { getUserInitials } from "@/lib/user";

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
    })
    .from(user)
    .orderBy(asc(user.name));

  return (
    <SettingsSection
      description="Everyone with access to this workspace. Accounts are created by the admin; there is no public sign-up."
      icon={Users}
      title="Team members"
    >
      <SettingsPanel className="gap-0 divide-y p-0">
        {members.map((member) => {
          const isYou = member.id === session.user.id;
          return (
            <div className="flex items-center gap-3 p-4 sm:p-5" key={member.id}>
              <Avatar>
                {member.image ? (
                  <AvatarImage alt={member.name} src={member.image} />
                ) : null}
                <AvatarFallback className="bg-primary font-medium text-primary-foreground">
                  {getUserInitials(member.name, member.email)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-sm">
                  {member.name}
                  {isYou ? (
                    <span className="ml-2 text-muted-foreground text-xs">
                      You
                    </span>
                  ) : null}
                </p>
                <p className="truncate text-muted-foreground text-xs">
                  {member.email}
                </p>
              </div>
              <Badge className="capitalize" variant="secondary">
                {member.role}
              </Badge>
            </div>
          );
        })}
      </SettingsPanel>
    </SettingsSection>
  );
}
