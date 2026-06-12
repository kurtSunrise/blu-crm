import Link from "next/link";

export const metadata = {
  title: "Help | Blu CRM",
};

interface HelpSection {
  admin?: boolean;
  body: React.ReactNode;
  id: string;
  title: string;
}

const STEP_CLASSES = "list-decimal flex flex-col gap-1 pl-5 text-sm";
const PARA_CLASSES = "text-muted-foreground text-sm";

const SECTIONS: HelpSection[] = [
  {
    id: "signing-in",
    title: "Signing in",
    body: (
      <>
        <p className={PARA_CLASSES}>
          Blu CRM is private to the team: every page except the public enquiry
          form and client quote links needs a sign-in.
        </p>
        <ol className={STEP_CLASSES}>
          <li>
            Sign in with your <strong>@blu.builders email</strong> and password.
            Your browser stays signed in on that device.
          </li>
          <li>
            Change your password any time under{" "}
            <strong>Settings, Account</strong>. Do this after your first sign-in
            if you were given a starter password.
          </li>
          <li>
            <strong>Sign out</strong> lives at the bottom of the sidebar on
            desktop, or in the header on a phone.
          </li>
        </ol>
      </>
    ),
  },
  {
    id: "getting-started",
    title: "Getting started",
    body: (
      <>
        <p className={PARA_CLASSES}>
          Blu CRM is the sales team's shared memory: every enquiry becomes a
          deal, every deal moves through the pipeline, and every open deal
          carries a next action so nothing slips. Three ideas cover most of the
          app:
        </p>
        <ol className={STEP_CLASSES}>
          <li>
            <strong>Deals</strong> are the centre of everything. One enquiry
            equals one deal, with a permanent Lead ID like BLU-2026-014.
          </li>
          <li>
            <strong>The pipeline</strong> is Blu's eight stages, from Lead
            Captured through to Won or Lost / Dormant.
          </li>
          <li>
            <strong>Follow-ups</strong> are dated next actions. The Tasks page
            shows what is due today and what is overdue, per person.
          </li>
        </ol>
      </>
    ),
  },
  {
    id: "capture",
    title: "Capture a lead",
    body: (
      <>
        <p className={PARA_CLASSES}>
          Leads arrive four ways and all land in the same place. Captured leads
          start in Lead Captured; leads without an owner wait in the Inbox for
          triage.
        </p>
        <ol className={STEP_CLASSES}>
          <li>
            <strong>Quick add</strong> (phone-friendly, under 60 seconds): open
            Quick add, enter the client or brand plus one contact method, and
            tap Add lead. Everything else is optional.
          </li>
          <li>
            <strong>Web enquiries</strong> from the public form post straight
            into the Inbox, tagged Web. Nothing depends on someone checking an
            email inbox.
          </li>
          <li>
            <strong>Forwarded emails</strong> to the intake address become raw
            leads with the original email attached to the timeline.
          </li>
          <li>
            <strong>CSV import</strong> bulk-loads existing contacts or open
            deals from a spreadsheet via{" "}
            <Link
              className="underline underline-offset-2"
              href="/settings/import"
            >
              Settings, CSV import
            </Link>
            .
          </li>
        </ol>
      </>
    ),
  },
  {
    id: "inbox",
    title: "Triage the Inbox",
    body: (
      <>
        <p className={PARA_CLASSES}>
          The Inbox holds new and unassigned leads from every channel. Clear it
          daily; an assigned lead leaves the Inbox and shows up in its owner's
          world.
        </p>
        <ol className={STEP_CLASSES}>
          <li>Open the lead to read the enquiry and timeline.</li>
          <li>
            Use "Assign to" to give it an owner. The owner gets an in-app
            notification.
          </li>
          <li>
            Discard junk with the bin button. Discards are soft deletes, so
            nothing is ever truly lost.
          </li>
        </ol>
      </>
    ),
  },
  {
    id: "pipeline",
    title: "Work the pipeline",
    body: (
      <>
        <p className={PARA_CLASSES}>
          The board shows every open deal across Blu's eight stages with a count
          and AUD total per column. Drag a card between stages, or use the arrow
          menu on the card if dragging is awkward; both record the change on the
          deal's timeline.
        </p>
        <ol className={STEP_CLASSES}>
          <li>
            Moving a deal to <strong>Won</strong> asks about the handover to
            delivery flag. Leaving it on notifies Kurt that the job is his to
            deliver.
          </li>
          <li>
            Moving a deal to <strong>Lost / Dormant</strong> requires a reason
            (price, timing, went elsewhere, no response, or parked). The reason
            is kept for win-rate reporting.
          </li>
          <li>
            Won and Lost deals stop counting toward the open pipeline total on
            the dashboard.
          </li>
        </ol>
      </>
    ),
  },
  {
    id: "calendar",
    title: "Calendar",
    body: (
      <>
        <p className={PARA_CLASSES}>
          The Calendar shows the month's key dates in one view so you can see
          how busy the team is. Three colours cover everything:
        </p>
        <ol className={STEP_CLASSES}>
          <li>
            <strong>Amber</strong>: fixed dates — the install, event, or launch
            date the job must hit.
          </li>
          <li>
            <strong>Blue</strong>: expected close dates on open deals.
          </li>
          <li>
            <strong>Green</strong>: follow-ups due that day.
          </li>
        </ol>
        <p className={PARA_CLASSES}>
          Use the arrows to move between months and Today to jump back. On a
          phone, tap a day in the grid to jump to its list below; every item
          links to its deal. Completed follow-ups and Lost / Dormant deals are
          hidden, and a deal's expected close disappears once it is Won — but
          its install date stays, because the work still happens. All dates are
          Perth time.
        </p>
      </>
    ),
  },
  {
    id: "follow-ups",
    title: "Follow-ups and the Tasks page",
    body: (
      <>
        <p className={PARA_CLASSES}>
          Every open deal should carry a next action with an owner and a due
          date. Add follow-ups from the deal page; work them from Tasks.
        </p>
        <ol className={STEP_CLASSES}>
          <li>
            On a deal, fill in "Next action", pick the owner and due date, and
            tap Add follow-up.
          </li>
          <li>
            The Tasks page buckets everything into Overdue (red, always on top),
            Today, and Upcoming, in Perth time.
          </li>
          <li>Tap the tick to mark a follow-up done.</li>
          <li>
            Use the name chips at the top of Tasks to see one person's list.
          </li>
        </ol>
        <p className={PARA_CLASSES}>
          Overdue follow-ups also raise an in-app notification for their owner.
        </p>
      </>
    ),
  },
  {
    id: "alerts",
    title: "Needs attention and closing soon",
    body: (
      <>
        <p className={PARA_CLASSES}>
          Two automatic lists on the Tasks page keep deals from going quiet:
        </p>
        <ol className={STEP_CLASSES}>
          <li>
            <strong>Needs attention</strong>: open deals with no logged contact
            for 7 or more days.
          </li>
          <li>
            <strong>Closing soon</strong>: deals with a fixed install, event, or
            launch date (or expected close) within 14 days, whatever stage they
            are in.
          </li>
        </ol>
        <p className={PARA_CLASSES}>
          Both thresholds are adjustable in Settings. Logging any activity on a
          deal (a call, a site visit) resets its contact clock.
        </p>
      </>
    ),
  },
  {
    id: "quotes",
    title: "Quotes and the client view link",
    body: (
      <>
        <ol className={STEP_CLASSES}>
          <li>On the deal page, add a quote with its AUD value.</li>
          <li>
            Mark it as sent when it goes to the client. That creates a private
            client view link you can paste into your email.
          </li>
          <li>
            When the client opens the link, the quote flips to Viewed and the
            deal owner gets a notification. Good moment to call.
          </li>
          <li>
            Mark the outcome Accepted or Declined. An accepted quote's value
            becomes the deal's value in all totals.
          </li>
        </ol>
        <p className={PARA_CLASSES}>
          The client link shows only that quote, never the CRM. Treat "Viewed"
          as a signal, not proof; some company mail scanners open links
          automatically.
        </p>
      </>
    ),
  },
  {
    id: "attachments",
    title: "Files and photos",
    body: (
      <>
        <p className={PARA_CLASSES}>
          Every deal has a "Files and photos" section. Use it for site-visit
          photos, briefs, drawings, and anything else the job needs on hand.
        </p>
        <ol className={STEP_CLASSES}>
          <li>
            On the deal page, tap the upload button and pick a file — on a phone
            you can shoot a photo straight from the camera.
          </li>
          <li>
            Photos show as thumbnails; other files show as named tiles. Tap to
            open.
          </li>
          <li>
            Files are stored privately and only open for signed-in users; there
            is no public link to share.
          </li>
        </ol>
      </>
    ),
  },
  {
    id: "contacts",
    title: "Contacts, companies, and duplicates",
    body: (
      <>
        <p className={PARA_CLASSES}>
          Contacts are people; companies are the brands, agencies, venues, and
          centres they work for. A contact page rolls up every deal and activity
          for that person, one tap from anywhere.
        </p>
        <p className={PARA_CLASSES}>
          When you add a contact who looks like an existing one (same email or
          phone, or a very similar name) the form warns you first and shows the
          match. Repeat clients are common; open the existing record instead of
          creating a twin, or choose "Create anyway" deliberately.
        </p>
      </>
    ),
  },
  {
    id: "notifications",
    title: "Notifications",
    body: (
      <p className={PARA_CLASSES}>
        The bell collects everything that needs eyes: new leads assigned to you,
        overdue follow-ups, quote-viewed alerts, and Won handovers. Unread items
        are highlighted; "Mark all read" clears the lot. Most notifications link
        straight to the deal they are about.
      </p>
    ),
  },
  {
    id: "reports",
    title: "Reports and the dashboard",
    body: (
      <>
        <p className={PARA_CLASSES}>
          The dashboard is the morning glance: the open pipeline total, deal
          count, and what needs attention today. Reports is the sit-down view
          with the same numbers the weekly Monday report uses.
        </p>
        <ol className={STEP_CLASSES}>
          <li>
            <strong>Pipeline overview</strong> shows the open total and the
            weighted forecast, which scales each stage's value by its win
            likelihood (weightings are set in Settings).
          </li>
          <li>
            <strong>Win rate</strong> covers a chosen period: won value, won and
            lost counts, and the lost reasons so you can see why work slips
            away.
          </li>
          <li>
            <strong>Copy report</strong> puts the whole thing on the clipboard
            as plain text, ready to paste into an email or WhatsApp.
          </li>
        </ol>
      </>
    ),
  },
  {
    id: "assistant",
    title: "The Blu assistant",
    body: (
      <>
        <p className={PARA_CLASSES}>
          The assistant (the sparkles button in the sidebar, or in the header on
          a phone) is a chat that works the CRM with you. It reads the live
          pipeline, never stale snapshots, and it can prepare changes, but
          nothing is ever applied without your say-so.
        </p>
        <ol className={STEP_CLASSES}>
          <li>
            <strong>Ask about the pipeline</strong>: "which deals have gone
            quiet for over a week?", "what's closing this month?", "which deals
            should I chase first?". Matching deals come back as cards you can
            tap through to.
          </li>
          <li>
            <strong>Capture a lead</strong> by pasting an enquiry. The assistant
            fills the intake template and asks for anything important that is
            missing (budget, fixed date, decision-maker) instead of inventing
            it.
          </li>
          <li>
            <strong>Drafts</strong>: follow-up emails, SMS, call scripts, and
            qualification questions arrive as cards you can edit in place and
            copy. Nothing is sent by the app.
          </li>
          <li>
            <strong>Confirmation gating</strong>: any change (new lead, stage
            move, follow-up, logged activity) pauses on a review card. Adjust
            the fields right on the card if needed, then Confirm or Cancel.
            Cancel means nothing happened.
          </li>
          <li>
            <strong>History</strong>: the clock button lists your recent
            conversations; pick one to resume it. The pencil button starts a
            fresh conversation.
          </li>
        </ol>
        <p className={PARA_CLASSES}>
          If the assistant is offline, the rest of the CRM keeps working exactly
          as normal.
        </p>
      </>
    ),
  },
  {
    id: "appearance",
    title: "Light and dark mode",
    body: (
      <p className={PARA_CLASSES}>
        The app follows your device's light or dark setting by default. To
        override it, use the toggle at the bottom of the sidebar on desktop or
        in the header on a phone. Your choice is remembered on that device.
      </p>
    ),
  },
  {
    id: "settings",
    title: "Settings",
    admin: true,
    body: (
      <>
        <p className={PARA_CLASSES}>
          Settings currently covers the alert thresholds (needs-attention days
          and closing-soon window) and CSV import. Changes apply to the whole
          team. Role-based access arrives with sign-in.
        </p>
      </>
    ),
  },
];

const FAQS = [
  {
    question: "Why is a deal not showing in the open pipeline total?",
    answer:
      "Won and Lost / Dormant deals are excluded from open totals on purpose. They still appear in their own columns on the board.",
  },
  {
    question: "What counts as contact for the needs-attention list?",
    answer:
      "Any quick-log activity on the deal: a call, email, site visit, or meeting. Stage changes and notes do not reset the clock.",
  },
  {
    question: "Can I undo a discard from the Inbox?",
    answer:
      "Discards are soft deletes, so the data is retained. There is no undo button yet; ask an admin to restore it.",
  },
  {
    question: "Why did the duplicate warning appear for a different name?",
    answer:
      "Exact email or phone matches always warn, whatever the name, because repeat clients often come back via a new colleague using a shared address or number.",
  },
  {
    question: "The client opened my quote but no alert arrived. Why?",
    answer:
      "The alert fires on the first open of the client view link. If the quote was already Viewed, later opens stay quiet. Check the deal timeline for the full history.",
  },
  {
    question: "Why is a deal's install date missing from the calendar?",
    answer:
      "Lost / Dormant and discarded deals are hidden from the calendar. If the deal is open or Won and still missing, check that its fixed date is filled in on the deal page.",
  },
];

const GLOSSARY = [
  ["Deal", "A sales opportunity. One enquiry equals one deal."],
  ["Lead ID", "The deal's permanent reference, like BLU-2026-014."],
  [
    "Fixed date",
    "A client-side install, event, or launch date the job must hit.",
  ],
  ["Stale deal", "An open deal with no logged contact for 7 or more days."],
  [
    "Closing soon",
    "A deal whose fixed date or expected close falls within 14 days.",
  ],
  [
    "Expected close",
    "The date a deal is forecast to be won; drives the closing-soon alert and shows in blue on the calendar.",
  ],
  [
    "Handover to delivery",
    "The flag raised on Won that passes the job to delivery (Kurt).",
  ],
  [
    "Source",
    "Where the lead came from: Web, Instagram, Referral, Repeat client, or Other.",
  ],
];

const WHATS_NEW = [
  {
    date: "11/06/2026",
    items: [
      "Calendar: a month view of fixed install / event / launch dates (amber), expected closes (blue), and follow-ups (green), with a tap-friendly day list on phones.",
      "Calendar joined the phone tab bar; Contacts moved to the dashboard, like Reports.",
      "Deal cards and deal pages now label fixed dates (Install / Event / Launch) and say how far away key dates are; overdue dates show in red.",
      "Deal pages lead with a key-dates strip linking straight to that month on the calendar.",
      "Pipeline board polish: clearer stage counts and drop targets.",
    ],
  },
  {
    date: "10/06/2026",
    items: [
      "Light and dark mode with a toggle in the sidebar and header.",
      "Help area (this page).",
      "Desktop layout: sidebar navigation and two-column deal and tasks pages.",
      "CSV import for contacts and open deals.",
      "Quotes with client view links and viewed alerts.",
      "Public web enquiry form, email-to-lead intake, and the leads Inbox.",
      "Follow-ups, the daily Tasks list, alerts, and in-app notifications.",
      "Won handover flag and required Lost / Dormant reasons.",
    ],
  },
];

export default function HelpPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 py-6 lg:max-w-3xl">
      <header className="flex flex-col gap-2">
        <h1 className="font-semibold text-2xl tracking-tight">
          Help and guides
        </h1>
        <p className="text-muted-foreground text-sm">
          How Blu CRM works, from capturing an enquiry to winning the job. Short
          on time? Each section starts with the steps.
        </p>
      </header>

      <nav aria-label="Help contents" className="rounded-lg border bg-card p-4">
        <h2 className="mb-2 font-heading font-medium text-sm">Contents</h2>
        <ol className="grid grid-cols-1 gap-1 sm:grid-cols-2">
          {[
            ...SECTIONS.map((section) => ({
              id: section.id,
              title: section.title,
            })),
            { id: "faq", title: "FAQ" },
            { id: "glossary", title: "Glossary" },
            { id: "whats-new", title: "What's new" },
          ].map((entry) => (
            <li key={entry.id}>
              <a
                className="text-blu text-sm underline-offset-2 hover:underline"
                href={`#${entry.id}`}
              >
                {entry.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      {SECTIONS.map((section) => (
        <section
          aria-label={section.title}
          className="flex scroll-mt-20 flex-col gap-3"
          id={section.id}
          key={section.id}
        >
          <h2 className="font-heading font-semibold text-lg">
            {section.title}
            {section.admin && (
              <span className="ml-2 rounded-full border px-2 py-0.5 align-middle font-normal text-muted-foreground text-xs">
                Admin
              </span>
            )}
          </h2>
          {section.body}
        </section>
      ))}

      <section
        aria-label="FAQ"
        className="flex scroll-mt-20 flex-col gap-3"
        id="faq"
      >
        <h2 className="font-heading font-semibold text-lg">FAQ</h2>
        <div className="flex flex-col gap-2">
          {FAQS.map((faq) => (
            <details
              className="group rounded-lg border bg-card p-3"
              key={faq.question}
            >
              <summary className="cursor-pointer font-medium text-sm">
                {faq.question}
              </summary>
              <p className="mt-2 text-muted-foreground text-sm">{faq.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section
        aria-label="Glossary"
        className="flex scroll-mt-20 flex-col gap-3"
        id="glossary"
      >
        <h2 className="font-heading font-semibold text-lg">Glossary</h2>
        <dl className="flex flex-col gap-2">
          {GLOSSARY.map(([term, definition]) => (
            <div className="flex flex-col" key={term}>
              <dt className="font-medium text-sm">{term}</dt>
              <dd className="text-muted-foreground text-sm">{definition}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section
        aria-label="What's new"
        className="flex scroll-mt-20 flex-col gap-3"
        id="whats-new"
      >
        <h2 className="font-heading font-semibold text-lg">What's new</h2>
        {WHATS_NEW.map((release) => (
          <div className="flex flex-col gap-2" key={release.date}>
            <h3 className="font-medium text-muted-foreground text-sm">
              {release.date}
            </h3>
            <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
              {release.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <footer className="rounded-lg border bg-card p-4 text-muted-foreground text-sm">
        Stuck? Ask Kurt, or email info@blu.builders. Office line (08) 6285 0231,
        Mon to Fri 9:30am to 3:00pm AWST.
      </footer>
    </main>
  );
}
