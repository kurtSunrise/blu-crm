import Link from "next/link";

// Global 404 for URLs that match no route. Renders inside the root layout
// only (no app shell), so it works signed in or out.
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="font-heading font-semibold text-2xl">
        That page does not exist
      </h1>
      <p className="text-muted-foreground text-sm">
        The address may be mistyped, or the page may have moved.
      </p>
      <Link
        className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-6 font-medium text-primary-foreground text-sm"
        href="/"
      >
        Back to the dashboard
      </Link>
    </main>
  );
}
