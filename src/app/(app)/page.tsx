import { and, count, eq, gte, isNull, lt, sql } from "drizzle-orm";
import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { db } from "@/db";
import { deal, followUp, pipelineStage } from "@/db/schema";
import {
  getAlertThresholds,
  getClosingSoonDeals,
  getStaleDeals,
} from "@/lib/alerts";
import { awstDayRange, formatAudFromCents } from "@/lib/format";

export const dynamic = "force-dynamic";

const MODULES = [
  {
    name: "Pipeline",
    description: "Kanban board across Blu's eight stages with value totals.",
    milestone: "Live",
    href: "/pipeline",
  },
  {
    name: "Contacts",
    description: "People and companies with full deal history in one place.",
    milestone: "Live",
    href: "/contacts",
  },
  {
    name: "Quick add",
    description: "Capture a lead in under 60 seconds, from the field.",
    milestone: "Live",
    href: "/deals/new",
  },
  {
    name: "Tasks",
    description: "Today's and overdue follow-ups — never drop a follow-up.",
    milestone: "Live",
    href: "/tasks",
  },
  {
    name: "Inbox",
    description: "New and unassigned leads from all four intake channels.",
    milestone: "Live",
    href: "/inbox",
  },
  {
    name: "AI Assistant",
    description: "Claude-powered chat with editable artifacts and tool use.",
    milestone: "M4",
  },
  {
    name: "Reports",
    description: "Pipeline value, win rate, forecast, and the Monday report.",
    milestone: "Live",
    href: "/reports",
  },
  {
    name: "Help",
    description: "Guides for every flow, FAQ, glossary, and what's new.",
    milestone: "Live",
    href: "/help",
  },
];

function ModuleCard({ module }: { module: (typeof MODULES)[number] }) {
  const card = (
    <Card
      className={
        module.href ? "h-full transition-colors hover:border-blu" : "h-full"
      }
    >
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          <span>{module.name}</span>
          <Badge variant={module.href ? "default" : "secondary"}>
            {module.milestone}
          </Badge>
        </CardTitle>
        <CardDescription>{module.description}</CardDescription>
      </CardHeader>
    </Card>
  );

  if (module.href) {
    return (
      <Link className="block h-full" href={module.href}>
        {card}
      </Link>
    );
  }
  return card;
}

export default async function Home() {
  const { start, end } = awstDayRange();

  const [openPipeline] = await db
    .select({
      // Quoted value wins over the estimate (FR-1.4 AC); Won and Lost deals
      // are excluded from open-pipeline totals (FR-1.6 AC).
      totalCents: sql<number>`coalesce(sum(coalesce(${deal.quotedValueCents}, ${deal.estimatedValueCents}, 0)), 0)`,
      dealCount: count(deal.id),
    })
    .from(deal)
    .innerJoin(pipelineStage, eq(deal.stageId, pipelineStage.id))
    .where(
      and(
        isNull(deal.deletedAt),
        eq(pipelineStage.isWon, false),
        eq(pipelineStage.isLost, false)
      )
    );

  const [overdue] = await db
    .select({ value: count(followUp.id) })
    .from(followUp)
    .where(and(isNull(followUp.completedAt), lt(followUp.dueDate, start)));

  const [dueToday] = await db
    .select({ value: count(followUp.id) })
    .from(followUp)
    .where(
      and(
        isNull(followUp.completedAt),
        gte(followUp.dueDate, start),
        lt(followUp.dueDate, end)
      )
    );

  const thresholds = await getAlertThresholds();
  const staleDeals = await getStaleDeals(thresholds.staleDays);
  const closingSoonDeals = await getClosingSoonDeals(
    thresholds.closingSoonDays
  );

  const stats = [
    { label: "Overdue tasks", value: overdue?.value ?? 0, alert: true },
    { label: "Due today", value: dueToday?.value ?? 0, alert: false },
    { label: "Needs attention", value: staleDeals.length, alert: true },
    { label: "Closing soon", value: closingSoonDeals.length, alert: false },
  ];

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-2">
        <BrandMark className="mb-2 block" priority size={64} />
        <p className="font-medium text-blu text-sm uppercase tracking-widest">
          Blu Builders — The Creative Build Company
        </p>
        <h1 className="font-semibold text-4xl tracking-tight">Blu CRM</h1>
        <p className="max-w-prose text-muted-foreground">
          One shared place to capture every enquiry, work the pipeline, and
          never drop a follow-up.
        </p>
      </header>
      <section aria-label="Today" className="flex flex-col gap-3">
        <p className="text-muted-foreground text-sm">
          Open pipeline:{" "}
          <span className="font-medium text-foreground">
            {formatAudFromCents(Number(openPipeline?.totalCents ?? 0))}
          </span>{" "}
          across {openPipeline?.dealCount ?? 0} open deals
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {stats.map((stat) => (
            <Link
              className="flex flex-col gap-1 rounded-lg border bg-card p-3 transition-colors hover:border-blu"
              href="/tasks"
              key={stat.label}
            >
              <span
                className={
                  stat.alert && stat.value > 0
                    ? "font-semibold text-2xl text-destructive"
                    : "font-semibold text-2xl"
                }
              >
                {stat.value}
              </span>
              <span className="text-muted-foreground text-xs">
                {stat.label}
              </span>
            </Link>
          ))}
        </div>
      </section>
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {MODULES.map((module) => (
          <ModuleCard key={module.name} module={module} />
        ))}
      </section>
      <footer className="mt-auto pt-8 text-muted-foreground text-sm">
        Blu.Builders Pty Ltd · Malaga, Western Australia
      </footer>
    </main>
  );
}
