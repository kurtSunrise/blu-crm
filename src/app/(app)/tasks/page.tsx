import { and, asc, eq, isNull } from "drizzle-orm";
import Link from "next/link";
import { CompleteFollowUpButton } from "@/components/complete-follow-up-button";
import { Badge } from "@/components/ui/badge";
import { db } from "@/db";
import { deal, followUp, user } from "@/db/schema";
import {
  getAlertThresholds,
  getClosingSoonDeals,
  getStaleDeals,
} from "@/lib/alerts";
import { awstDayRange, formatDateAwst } from "@/lib/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface TaskRow {
  action: string;
  dealId: string;
  dealTitle: string;
  dueDate: Date;
  id: string;
  leadId: string;
  ownerId: string;
  ownerName: string | null;
}

function TaskItem({ task, overdue }: { task: TaskRow; overdue: boolean }) {
  return (
    <li
      className={cn(
        "flex items-center gap-3 rounded-lg border bg-card p-3",
        overdue && "border-destructive/60"
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="font-medium text-sm">{task.action}</p>
        <p className="truncate text-muted-foreground text-xs">
          <Link
            className="underline underline-offset-2"
            href={`/deals/${task.dealId}`}
          >
            {task.dealTitle}
          </Link>
          {task.ownerName ? ` · ${task.ownerName.split(" ")[0]}` : ""}
          {" · due "}
          <span className={cn(overdue && "font-medium text-destructive")}>
            {formatDateAwst(task.dueDate)}
          </span>
        </p>
      </div>
      {overdue && <Badge variant="destructive">Overdue</Badge>}
      <CompleteFollowUpButton action={task.action} followUpId={task.id} />
    </li>
  );
}

function TaskSection({
  label,
  tasks,
  overdue = false,
  emptyText,
}: {
  label: string;
  tasks: TaskRow[];
  overdue?: boolean;
  emptyText: string;
}) {
  return (
    <section aria-label={label} className="flex flex-col gap-2">
      <h2 className="font-heading font-medium text-sm">{label}</h2>
      {tasks.length === 0 ? (
        <p className="text-muted-foreground text-sm">{emptyText}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {tasks.map((task) => (
            <TaskItem key={task.id} overdue={overdue} task={task} />
          ))}
        </ul>
      )}
    </section>
  );
}

function AlertSection({
  label,
  description,
  deals,
}: {
  label: string;
  description: string;
  deals: {
    id: string;
    leadId: string;
    title: string;
    companyName: string | null;
    stageName: string;
    fixedDate: Date | null;
    expectedCloseDate: Date | null;
    lastContactAt: Date | null;
    createdAt: Date;
  }[];
}) {
  return (
    <section aria-label={label} className="flex flex-col gap-2">
      <h2 className="font-heading font-medium text-sm">{label}</h2>
      <p className="text-muted-foreground text-xs">{description}</p>
      {deals.length === 0 ? (
        <p className="text-muted-foreground text-sm">Nothing right now.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {deals.map((item) => {
            const keyDate = item.fixedDate ?? item.expectedCloseDate;
            const lastContact = item.lastContactAt ?? item.createdAt;
            return (
              <li key={item.id}>
                <Link
                  className="flex items-center gap-3 rounded-lg border bg-card p-3"
                  href={`/deals/${item.id}`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-sm">{item.title}</p>
                    <p className="truncate text-muted-foreground text-xs">
                      {item.companyName ?? "No company"}
                      {keyDate ? ` · date ${formatDateAwst(keyDate)}` : ""}
                      {` · last contact ${formatDateAwst(lastContact)}`}
                    </p>
                  </div>
                  <Badge variant="secondary">{item.stageName}</Badge>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ owner?: string }>;
}) {
  const { owner } = await searchParams;

  // Queries run in parallel batches to avoid sequential Neon round-trips; the
  // follow-up query waits on users only because the owner filter is validated
  // against the user list.
  const [users, thresholds] = await Promise.all([
    db
      .select({ id: user.id, name: user.name })
      .from(user)
      .orderBy(asc(user.name)),
    getAlertThresholds(),
  ]);

  const ownerFilter = users.some((person) => person.id === owner)
    ? owner
    : undefined;

  const [rows, staleDeals, closingSoonDeals] = await Promise.all([
    db
      .select({
        id: followUp.id,
        action: followUp.action,
        dueDate: followUp.dueDate,
        ownerId: followUp.ownerId,
        ownerName: user.name,
        dealId: deal.id,
        dealTitle: deal.title,
        leadId: deal.leadId,
      })
      .from(followUp)
      .innerJoin(deal, eq(followUp.dealId, deal.id))
      .leftJoin(user, eq(followUp.ownerId, user.id))
      .where(
        and(
          isNull(followUp.completedAt),
          isNull(deal.deletedAt),
          ownerFilter ? eq(followUp.ownerId, ownerFilter) : undefined
        )
      )
      .orderBy(asc(followUp.dueDate)),
    getStaleDeals(thresholds.staleDays),
    getClosingSoonDeals(thresholds.closingSoonDays),
  ]);

  // Overdue sorts above today's items (FR-5.2 AC), bucketed by Perth days.
  const { start, end } = awstDayRange();
  const overdueTasks = rows.filter((task) => task.dueDate < start);
  const todayTasks = rows.filter(
    (task) => task.dueDate >= start && task.dueDate < end
  );
  const upcomingTasks = rows.filter((task) => task.dueDate >= end);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 lg:max-w-5xl">
      <header className="flex flex-col gap-3">
        <h1 className="font-semibold text-2xl tracking-tight">Tasks</h1>
        <nav aria-label="Filter by owner" className="flex flex-wrap gap-2">
          <Link
            className={cn(
              "flex min-h-9 items-center rounded-full border px-4 text-sm",
              ownerFilter ? "text-muted-foreground" : "border-blu text-blu"
            )}
            href="/tasks"
          >
            Everyone
          </Link>
          {users.map((person) => (
            <Link
              className={cn(
                "flex min-h-9 items-center rounded-full border px-4 text-sm",
                ownerFilter === person.id
                  ? "border-blu text-blu"
                  : "text-muted-foreground"
              )}
              href={`/tasks?owner=${person.id}`}
              key={person.id}
            >
              {person.name.split(" ")[0]}
            </Link>
          ))}
        </nav>
      </header>

      {/* Desktop: the day's tasks beside the deal alerts. */}
      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-2 lg:items-start lg:gap-10">
        <div className="flex flex-col gap-6">
          <TaskSection
            emptyText="Nothing overdue. Keep it that way."
            label="Overdue"
            overdue
            tasks={overdueTasks}
          />
          <TaskSection
            emptyText="Nothing due today."
            label="Today"
            tasks={todayTasks}
          />
          <TaskSection
            emptyText="Nothing scheduled yet."
            label="Upcoming"
            tasks={upcomingTasks}
          />
        </div>

        <div className="flex flex-col gap-6">
          <AlertSection
            deals={staleDeals}
            description={`Open deals with no contact for ${thresholds.staleDays}+ days.`}
            label="Needs attention"
          />
          <AlertSection
            deals={closingSoonDeals}
            description={`Fixed date or expected close within ${thresholds.closingSoonDays} days.`}
            label="Closing soon"
          />
        </div>
      </div>
    </main>
  );
}
