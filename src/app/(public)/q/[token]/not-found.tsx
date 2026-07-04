import { BrandMark } from "@/components/brand-mark";

// Shown when a quote link's token matches nothing. The copy deliberately
// does not distinguish "never existed" from "expired", and links nowhere
// inside the CRM: this is a client-facing public page.
export default function QuoteNotFound() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-10">
      <header className="flex flex-col gap-2">
        <BrandMark className="block" size={48} />
        <h1 className="font-heading font-semibold text-2xl tracking-tight">
          Quote link not available
        </h1>
      </header>
      <p className="text-muted-foreground text-sm">
        This quote link is invalid or has expired. If you were expecting a quote
        from Blu Builders, get in touch and we will send you a fresh link.
      </p>
    </main>
  );
}
