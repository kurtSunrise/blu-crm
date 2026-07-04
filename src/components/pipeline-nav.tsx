import { PillNav } from "@/components/pill-nav";

const PIPELINE_LINKS = [
  { href: "/pipeline", label: "Board" },
  { href: "/pipeline/closed", label: "Closed" },
] as const;

export type PipelineNavKey = (typeof PIPELINE_LINKS)[number]["href"];

// Ties the board and the closed-deals view together the same way the report
// views are tied, replacing the old one-off text links in both directions.
export function PipelineNav({ active }: { active: PipelineNavKey }) {
  return (
    <PillNav
      active={active}
      ariaLabel="Pipeline views"
      links={PIPELINE_LINKS}
    />
  );
}
