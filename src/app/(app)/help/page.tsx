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
            <strong>Settings, Account, Change password</strong>. Do this after
            your first sign-in if you were given a starter password.
          </li>
          <li>
            Your <strong>avatar menu</strong> holds Account, Settings, the light
            / dark toggle, and <strong>Log out</strong>. It sits at the bottom
            of the sidebar on desktop and in the top-right of the header on a
            phone.
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
        <p className={PARA_CLASSES}>
          To keep the board focused, the <strong>Won</strong> and{" "}
          <strong>Lost / Dormant</strong> columns collapse to a summary and show
          only recently closed deals. Open the{" "}
          <Link
            className="underline underline-offset-2"
            href="/pipeline/closed"
          >
            Closed deals
          </Link>{" "}
          view (from the pipeline heading, or a column's "View all") for the
          full history, filterable by outcome, owner, and close date.
        </p>
        <p className={PARA_CLASSES}>
          A deal can also carry an <strong>On hold</strong> or{" "}
          <strong>Blocked</strong> label without leaving its stage; use the
          status control on the card or deal page, and the "Filter by status"
          row at the top of the board to focus on them. On desktop, hover a card
          to see a quick preview (turn it on and choose its fields under
          Settings, General).
        </p>
      </>
    ),
  },
  {
    id: "sub-status",
    title: "On hold and blocked deals",
    body: (
      <>
        <p className={PARA_CLASSES}>
          Sometimes a deal is alive but stuck. Flag it without moving it out of
          its stage so the reason is visible and it still counts in your
          pipeline totals.
        </p>
        <ol className={STEP_CLASSES}>
          <li>
            Open the status control on the card or deal page and pick a label:
            On Hold (awaiting client, third party, or internal review) or
            Blocked (external dependency).
          </li>
          <li>
            Add an optional note on why (for example, "Waiting on creative from
            the agency, expected 25 June").
          </li>
          <li>
            Use "Filter by status" at the top of the board to show only held or
            blocked deals, and check the "On hold / blocked" section in Reports
            for the count and value held up.
          </li>
        </ol>
        <p className={PARA_CLASSES}>
          Admins can tailor these labels under{" "}
          <Link
            className="underline underline-offset-2"
            href="/settings/statuses"
          >
            Settings, Deal statuses
          </Link>
          : add, rename, recolour, reorder, or archive them for the whole team.
        </p>
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
            <strong>Amber</strong>: fixed dates, the install, event, or launch
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
          hidden, and a deal's expected close disappears once it is Won, but its
          install date stays, because the work still happens. All dates are
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
            On the deal page, tap the upload button and pick a file; on a phone
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
    id: "notes",
    title: "Notes, updates, and shared folders",
    body: (
      <>
        <p className={PARA_CLASSES}>
          Each deal has an "Add a note" composer for call summaries, updates, or
          context for the team. Notes land on the deal's timeline and the
          assistant can read them, so write them as if briefing a colleague.
        </p>
        <p className={PARA_CLASSES}>
          Use "Add shared folder link" to keep a OneDrive or shared-folder URL
          on the deal. It is an interim home for bigger files until the
          Microsoft 365 integration lands; the link opens in a new tab for
          signed-in users.
        </p>
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
        The bell shows your unread count and collects everything that needs your
        eyes: new leads assigned to you, follow-ups due today or overdue, quiet
        deals needing attention, quote-viewed alerts, and Won handovers. The
        feed is yours alone; teammates each have their own. Tap a notification
        to jump to its deal (it marks itself read), tick the button on a card to
        flip read state, or "Mark all read" to clear your lot. Choose which
        types you receive under Settings then Notifications; admins also pick
        who receives Won handovers there.
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
          with the same numbers the weekly Monday report uses, split into six
          views — <strong>Overview</strong>, <strong>Trends</strong>,{" "}
          <strong>Funnel</strong>, <strong>Team</strong>,{" "}
          <strong>Weekly</strong>, and <strong>Daily</strong> — switched with
          the pills at the top.
        </p>
        <ol className={STEP_CLASSES}>
          <li>
            <strong>Filters</strong> sit above every report: pick a period (last
            7, 30, or 90 days, or your own from / to dates) and narrow to one
            owner or lead source. Filters follow you between the report views.
          </li>
          <li>
            <strong>Tap any figure to drill down.</strong> The stat cards, stage
            bars, and on-hold rows on the Overview all open a list of the exact
            deals behind that number; tap a deal to open it.
          </li>
          <li>
            <strong>Pipeline overview</strong> shows the open total and the
            weighted forecast, which scales each stage's value by its win
            likelihood (weightings are set in Settings).
          </li>
          <li>
            <strong>Win rate</strong> covers the chosen period: won value, won
            and lost counts, and the lost reasons so you can see why work slips
            away.
          </li>
          <li>
            <strong>On hold / blocked</strong> shows how many open deals are
            flagged and the total value held up, so stuck work stays visible.
          </li>
          <li>
            <strong>Trends</strong> charts new pipeline against won value week
            by week, shows the weighted forecast by expected close month, and
            lists <strong>slipped deals</strong> — open deals past their
            expected close date that need re-dating or a decision. Hover or tap
            a chart point for the exact figures, or open "View as table".
          </li>
          <li>
            <strong>Funnel</strong> follows the deals created in the chosen
            period through the stages: how many reached each stage, the
            conversion rate between stages, the median time spent in each stage,
            and a <strong>Bottleneck</strong> badge on the slowest one. Stage
            history has been recorded precisely since early July 2026; older
            history is reconstructed from timeline notes, so the funnel gets
            more accurate over time.
          </li>
          <li>
            <strong>Team</strong> covers the people side: the quote funnel
            (sent, viewed, accepted, with the average days to open and to
            decide), each person's logged activity for the period, and follow-up
            completion — done rate, on-time rate, and anything still overdue.
            Use the owner filter to zoom in on one person.
          </li>
          <li>
            <strong>Export CSV</strong> (on the Overview, Trends, and drill-down
            pages) downloads the numbers on screen — with your current filters
            applied — for a spreadsheet.
          </li>
          <li>
            <strong>Weekly</strong> is the seven-section Monday report;{" "}
            <strong>Copy report</strong> puts it on the clipboard as plain text,
            ready to paste into an email or WhatsApp.
          </li>
          <li>
            <strong>Daily</strong> shows everything that happened on each deal
            on a given day, with day-by-day navigation.
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
          The assistant (the sparkles button in the sidebar, the header or More
          menu on a phone, or Cmd+J / Ctrl+J on a keyboard) is a chat that works
          the CRM with you. It reads the live pipeline, never stale snapshots,
          and it can prepare changes, but nothing is ever applied without your
          say-so. On a deal or contact page, a chip above the message box shows
          the record the assistant is drawing on, so questions like "summarise
          this deal" just work, and an "Ask Blu AI" button starts a chat about
          that record with the question already typed for you.
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
            copy. Nothing is sent by the app. To steer the tone and rules of
            those drafts for the whole team, set custom instructions under
            Settings, AI Preferences.
          </li>
          <li>
            <strong>Files and photos</strong>: attach an image or PDF with the
            paperclip, or drag a file straight onto the chat, and ask about
            photos or files already on a deal; the assistant can read them and
            the deal's notes for context. Tap a photo you've sent to see it full
            size.
          </li>
          <li>
            <strong>Talk instead of typing</strong>: tap the mic button on the
            message box to dictate. The words land in the box for you to check
            and edit before sending; nothing is sent automatically. Handy on
            site.
          </li>
          <li>
            <strong>Confirmation gating</strong>: any change (new lead, stage
            move, follow-up, logged activity) pauses on a review card. Adjust
            the fields right on the card if needed, then Confirm or Cancel.
            Cancel means nothing happened. If the assistant proposes several
            changes at once, they arrive as one checklist: keep or skip each
            item, tweak its fields, then confirm the lot; changes apply in order
            and stop if one fails.
          </li>
          <li>
            <strong>Suggestions</strong>: chips above the message box offer a
            sensible next question after each answer, and a fresh chat opens
            with starter prompts that match the page you are on. Tap one to send
            it.
          </li>
          <li>
            <strong>History</strong>: the clock button lists your recent
            conversations, each showing the deal or contact it was about; pick
            one to resume it, and its deal cards and review cards come back with
            it. Rename, pin, or delete a conversation from its row menu. The
            search box finds older chats by title, deal, or contact name. The
            pencil button starts a fresh conversation, and the gear button jumps
            straight to AI Preferences.
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
        override it, open the avatar menu (bottom of the sidebar on desktop, or
        the top-right of the header on a phone) and use the light / dark toggle;
        the same control also lives under Settings, General, Appearance. Your
        choice is remembered on that device.
      </p>
    ),
  },
  {
    id: "account",
    title: "Your account",
    body: (
      <>
        <p className={PARA_CLASSES}>
          Settings, Account is where you manage yourself:
        </p>
        <ol className={STEP_CLASSES}>
          <li>
            <strong>Profile</strong>: edit your name and avatar, and change your
            password.
          </li>
          <li>
            <strong>Active sessions</strong>: see where you are signed in and
            sign out a single device, or log out of all devices at once.
          </li>
          <li>
            <strong>Delete account</strong>: a password-confirmed, immediate
            removal in the danger zone. Only do this if you mean it.
          </li>
        </ol>
      </>
    ),
  },
  {
    id: "team",
    title: "Your team",
    admin: true,
    body: (
      <>
        <p className={PARA_CLASSES}>
          Admins manage the team under{" "}
          <Link className="underline underline-offset-2" href="/settings/team">
            Settings, Team
          </Link>
          : add a member, set each person's role (Sales or Admin), and disable
          or re-enable an account. Everyone else sees the list read-only.
        </p>
      </>
    ),
  },
  {
    id: "settings",
    title: "Settings",
    admin: true,
    body: (
      <>
        <p className={PARA_CLASSES}>
          Settings is split into six tabs. Changes to shared options apply to
          the whole team.
        </p>
        <ol className={STEP_CLASSES}>
          <li>
            <strong>General</strong>: the pipeline stages (rename, reorder, add,
            or remove them; Won and Lost / Dormant stay fixed at the end),
            forecast weightings (how much of each stage's value counts toward
            the weighted forecast), alerts ("Needs attention after" and "Closing
            soon within", both in days), the pipeline card hover preview, and
            the appearance toggle.
          </li>
          <li>
            <strong>Deal statuses</strong>: add, rename, recolour, reorder, or
            archive the On hold and Blocked labels, and choose where the status
            control appears (board cards, deal page). See "On hold and blocked
            deals" above.
          </li>
          <li>
            <strong>Account</strong>: your profile and password, your active
            sessions, log out of all devices, and delete account. See "Your
            account" above.
          </li>
          <li>
            <strong>Company</strong>: read-only business details, the lead
            intake links (public form and email-to-lead), and the{" "}
            <Link
              className="underline underline-offset-2"
              href="/settings/import"
            >
              CSV import
            </Link>{" "}
            link.
          </li>
          <li>
            <strong>Team</strong>: add members and set roles (admin only). See
            "Your team" above.
          </li>
          <li>
            <strong>AI Preferences</strong>: photo vision status, when to
            describe deal files, the assistant's custom instructions, and which
            Claude model the assistant runs on.
          </li>
        </ol>
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
    question: "What's the difference between a stage and a sub-status?",
    answer:
      "A stage is where the deal sits in the pipeline (Lead Captured through Won). A sub-status is an On hold or Blocked flag layered on top: it explains why a deal is stuck without moving it out of its stage, so it still counts in your totals.",
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
  {
    question: "Do I need to refresh the page to see my changes?",
    answer:
      "No. Notes, photos, follow-ups, quotes, and stage or status changes all appear straight away on the deal, and a brief message confirms each one. If a save fails you will see an error message, so nothing is lost silently.",
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
  [
    "Sub-status",
    "An On hold or Blocked label that flags a deal without moving it out of its stage.",
  ],
  [
    "Weighted forecast",
    "Open pipeline value with each stage scaled by its win likelihood; weightings are set in Settings, General.",
  ],
  [
    "Slipped deal",
    "An open deal whose expected close date has passed; listed on the Trends report so it gets re-dated or decided.",
  ],
  [
    "Role",
    "Sales or Admin. Admins also manage team members and shared settings.",
  ],
];

const WHATS_NEW = [
  {
    date: "08/07/2026",
    items: [
      "The assistant now comes to you: every Monday morning it drops a ready-made weekly pipeline report into your chat, and Tuesday to Friday a short morning briefing with your follow-ups due, deals closing soon, and anything gone quiet. Each one lands as a notification you can tap to open.",
      "When a deal needs attention, its notification now has an Ask assistant button that opens the chat already primed to talk about that deal.",
      "Voice notes now stick around: dictating attaches the recording to your message, and asking the assistant to log the note on a deal files the audio on that deal's timeline too.",
      "Type / at the start of the assistant composer for quick commands (/report, /rank, /draft) and @ to mention a specific deal or contact so the assistant knows exactly which record you mean.",
      "Made a typo or want to rephrase? Edit your last message with the pencil and the assistant re-answers from there. You can also copy a whole conversation as Markdown from the header.",
      "Long conversations no longer forget their beginning: the assistant keeps a running summary of older messages and carries it forward.",
      "Admins can now manage the assistant's knowledge base in Settings, Knowledge: add, edit, or remove the documents it cites, with instant effect on answers.",
      "On a deal's timeline, hover any activity (or the Lead created marker) to see how long ago it happened, like '5 days ago', so you don't have to work it out from the date.",
    ],
  },
  {
    date: "07/07/2026",
    items: [
      "The assistant now remembers useful facts across conversations: tell it something worth keeping (who handles a client, how you sign off) and it saves a memory with a Memory saved chip you can undo on the spot. Review, edit, or remove everything it remembers under Settings, Account (admins can also add team-wide memories under AI Preferences).",
      "Knowledge answers now carry numbered citations: a [1] marker sits right in the answer and a Sources list underneath expands to show the exact passage each number quotes.",
      "Ask the assistant for the weekly pipeline report and it renders the full Monday snapshot as a card: summary, closing soon, needs attention, the pipeline by stage, won and lost, and the actions due. The Weekly report page also has an Ask AI button.",
      "Rate any assistant answer with a thumbs up or down; on a thumbs down you can say what was wrong (inaccurate, not relevant, incomplete) and add a comment. Your ratings help us tune the assistant.",
      "Reopened conversations now bring back the Reasoning section and the source chips too, not just the cards, and each source chip shows when its document was last updated.",
      "Admins get a new Assistant activity section under Settings, AI Preferences: messages per day, turns per person, write actions, outcomes, and feedback totals.",
      "Talk instead of typing: tap the mic in the assistant chat, speak, and review the transcript before sending. Nothing sends until you hit send.",
      "The assistant now shows what it is doing while it works (Searching deals, Creating the lead) and you can expand a Reasoning section to see how it thought through an answer.",
      "Ask for several changes at once: the assistant proposes them as one checklist where you can edit fields, untick any step, and confirm the rest together. Steps apply in order and stop if one fails.",
      "Conversations now reopen with everything in them: deal cards, drafts, and confirmation cards come back when you resume a chat from history, and an unanswered confirmation is still there waiting for your decision.",
      "Answers about how we work now cite their sources, with chips naming the policy document and section they came from, and the knowledge search understands meaning, not just matching words.",
      "After each answer the assistant suggests a next step as a tappable chip, and the starter prompts now match the page you are on.",
      "Rename, pin, or delete conversations from the history list, and regenerate the assistant's last reply if you want a second take.",
      "Open the assistant from anywhere with Cmd+J (or Ctrl+J), from the More menu on your phone, or with the new Ask Blu AI button on a deal or contact page.",
    ],
  },
  {
    date: "06/07/2026",
    items: [
      "The pipeline is roomier on phones: the title and the Board / Closed switch now share one line, and the status filters sit in a single row you can swipe sideways. The filters also stay pinned below the header while you scroll, so you can filter a tall column without scrolling back to the top.",
      "A new More tab on the phone bottom bar opens Dashboard, Contacts, and Reports.",
    ],
  },
  {
    date: "03/07/2026",
    items: [
      "New Funnel report (Reports, Funnel): stage-by-stage conversion for deals created in the chosen period, median time in each stage, and a Bottleneck badge on the slowest stage.",
      "New Team report (Reports, Team): quote funnel with average days to open and decide, per-person activity for the period, and follow-up completion with on-time and overdue counts.",
      "A refreshed assistant chat: clearer sense of when it's thinking versus replying, smoother open and close, and a settings shortcut in the header.",
      "On a deal or contact page, the assistant now shows a chip above the message box naming the record it's drawing on.",
      "Assistant history now shows which deal or contact each conversation was about, and a search box finds older chats by title, deal, or contact name.",
      "Hover a conversation in assistant history for a preview of how it opened and its latest exchange, like the pipeline card preview; the panel's header buttons also explain themselves on hover.",
      "Drag a photo or PDF straight onto the assistant chat instead of using the paperclip, with an upload indicator while it sends; tap a sent photo to see it full size.",
      "Deal cards, deal lists, and drafts in the assistant now have their own icon so you can tell them apart at a glance, and long activity lists have a Show more link.",
    ],
  },
  {
    date: "02/07/2026",
    items: [
      "Reports grew up: filter every report by period (including a custom date range), owner, and lead source, and tap any figure, stage bar, or on-hold row to see the exact deals behind it.",
      "New Trends report: new pipeline vs won value charted week by week, the weighted forecast by expected close month, and a slipped-deals list of open deals past their expected close date.",
      "Export CSV from the reports (Overview, Trends, and any drill-down list) with your current filters applied.",
      "Every pipeline stage move is now recorded as structured history, powering upcoming funnel and time-in-stage reporting.",
      "Deal updates now show straight away, with no page refresh: add a note, photo, follow-up, or quote, or change the stage or status, and the timeline and lists update in place.",
      "Every deal action now confirms with a brief on-screen message, and tells you if a save failed instead of leaving you guessing.",
      "Admins can choose which Claude model the assistant runs on under Settings, AI Preferences.",
    ],
  },
  {
    date: "30/06/2026",
    items: [
      "Closed deals get their own filterable view (open it from the pipeline heading or a column's View all), searchable by outcome, owner, and close date.",
      "The Won and Lost / Dormant columns on the board now collapse to a summary and keep only recently closed deals, so the active pipeline stays front and centre.",
      "Longer notes now save (up to 20,000 characters), and a note that fails to save keeps your text and shows why.",
    ],
  },
  {
    date: "23/06/2026",
    items: [
      "On hold and Blocked labels are now fully manageable by admins under Settings, Deal statuses: add, rename, recolour, reorder, or archive them.",
      "Refreshed, accessible status badge colours across the board and deal pages.",
    ],
  },
  {
    date: "22/06/2026",
    items: [
      "New Daily status report (Reports, Daily status): see everything that happened on each deal on any given day, with day-by-day navigation.",
    ],
  },
  {
    date: "18/06/2026",
    items: [
      "On hold and Blocked deal labels, shown on board cards, with a board filter and counts in Reports.",
      "Custom AI assistant instructions in Settings, AI Preferences to set the team's tone and rules for drafts.",
    ],
  },
  {
    date: "17/06/2026",
    items: [
      "The assistant can now read photos and files on a deal, and you can attach images or PDFs to a chat.",
      "An 'Add a note' composer and a shared-folder link on every deal.",
      "Hover a deal card on desktop for a quick preview (configurable in Settings, General).",
      "Completed follow-ups now appear as events on the deal timeline.",
    ],
  },
  {
    date: "16/06/2026",
    items: [
      "Avatar menu on desktop and phone, holding Account, Settings, the theme toggle, and Log out.",
      "Admin team management: add members, set roles, and disable accounts.",
      "Clearer stage names on the assistant's stage-move confirmation.",
    ],
  },
  {
    date: "15/06/2026",
    items: [
      "Settings reorganised into General, Account, Company, Team, and AI Preferences.",
      "A full Account page: profile, password, active sessions, and delete account.",
      "Editable pipeline stages and forecast weightings in Settings, General.",
    ],
  },
  {
    date: "12/06/2026",
    items: [
      "Team sign-in with @blu.builders accounts and Sales / Admin roles.",
    ],
  },
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
