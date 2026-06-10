import Image from "next/image";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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
    milestone: "M2",
  },
  {
    name: "Inbox",
    description: "New and unassigned leads from all four intake channels.",
    milestone: "M3",
  },
  {
    name: "AI Assistant",
    description: "Claude-powered chat with editable artifacts and tool use.",
    milestone: "M4",
  },
  {
    name: "Reports",
    description: "Pipeline value, win rate, forecast, and the Monday report.",
    milestone: "M5",
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

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-2">
        <Image
          alt="Blu Builders logo"
          className="mb-2"
          height={64}
          priority
          src="/logo-dark.png"
          width={64}
        />
        <p className="font-medium text-blu text-sm uppercase tracking-widest">
          Blu Builders — The Creative Build Company
        </p>
        <h1 className="font-semibold text-4xl tracking-tight">Blu CRM</h1>
        <p className="max-w-prose text-muted-foreground">
          One shared place to capture every enquiry, work the pipeline, and
          never drop a follow-up.
        </p>
      </header>
      <section className="grid gap-4 sm:grid-cols-2">
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
