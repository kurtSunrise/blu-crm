import { ContactForm } from "@/components/contact-form";

export default function NewContactPage() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-6">
      <header>
        <h1 className="font-semibold text-2xl tracking-tight">Add contact</h1>
        <p className="text-muted-foreground text-sm">
          We&apos;ll warn you if this person looks like an existing contact —
          repeat clients are common.
        </p>
      </header>
      <ContactForm />
    </main>
  );
}
