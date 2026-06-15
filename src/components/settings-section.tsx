import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// One labelled block on a settings tab: an icon tile, a heading, a short
// description, and the content beneath (usually a bordered card). The "danger"
// tone tints the icon and heading red for irreversible actions.
export function SettingsSection({
  icon: Icon,
  title,
  description,
  tone = "default",
  children,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  tone?: "default" | "danger";
  children: React.ReactNode;
}) {
  const isDanger = tone === "danger";

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-md border bg-card",
            isDanger
              ? "border-destructive/30 text-destructive"
              : "text-muted-foreground"
          )}
        >
          <Icon aria-hidden className="size-4.5" />
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2
            className={cn(
              "font-heading font-semibold text-lg",
              isDanger && "text-destructive"
            )}
          >
            {title}
          </h2>
          <p className="text-muted-foreground text-sm">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

// The bordered card the section content sits in. Pulled out so every tab uses
// the same panel chrome.
export function SettingsPanel({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-lg border bg-card p-4 sm:p-5",
        className
      )}
    >
      {children}
    </div>
  );
}
