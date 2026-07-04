import { ArrowLeft } from "lucide-react";
import Link from "next/link";

// The one header contract for every page: optional back link (always
// left-aligned above the title, with the arrow), optional eyebrow (e.g. a
// lead ID), title + subtitle, actions on the right of the title row, and
// arbitrary children below (badge rows etc.). Keeping every page on this
// component is what keeps the headers consistent — add slots here rather
// than hand-rolling a page-local header.
export function PageHeader({
  actions,
  backHref,
  backLabel = "Back",
  children,
  eyebrow,
  subtitle,
  title,
}: {
  actions?: React.ReactNode;
  backHref?: string;
  backLabel?: string;
  children?: React.ReactNode;
  eyebrow?: React.ReactNode;
  subtitle?: React.ReactNode;
  title: React.ReactNode;
}) {
  return (
    <header className="flex flex-col gap-2">
      {backHref && (
        <Link
          className="flex min-h-9 w-fit items-center gap-1.5 text-muted-foreground text-sm transition-colors hover:text-foreground"
          href={backHref}
        >
          <ArrowLeft aria-hidden className="size-4" />
          {backLabel}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          {eyebrow}
          <h1 className="font-semibold text-2xl tracking-tight">{title}</h1>
          {subtitle && (
            <div className="text-muted-foreground text-sm">{subtitle}</div>
          )}
        </div>
        {actions && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {actions}
          </div>
        )}
      </div>
      {children}
    </header>
  );
}
