import { SettingsHeading, SettingsNav } from "@/components/settings-nav";

// The settings shell: a full-width page heading above a left sub-nav and the
// active tab's content. Each tab page returns its sections only; the heading
// and nav live here so they don't re-render between tabs.
export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
      <SettingsHeading />
      <div className="flex flex-col gap-6 lg:flex-row lg:gap-10">
        <aside className="lg:w-56 lg:shrink-0">
          <SettingsNav />
        </aside>
        <div className="flex min-w-0 flex-1 flex-col gap-8">{children}</div>
      </div>
    </main>
  );
}
