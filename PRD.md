# Blu CRM — Client & Sales Pipeline Portal

## Product Requirements Document

| | |
|---|---|
| **Version** | 1.0 (supersedes v0.1) |
| **Status** | Ready for review |
| **Date** | 10 June 2026 |
| **Author** | Blu Builders |
| **Approver** | Andy Watson (Owner & CEO) |
| **Reviewers** | Kurt Weiss (PM), Jessica Rodin (BD & HR) |

**Business:** Blu.Builders Pty Ltd (ACN 670 602 847) — "The Creative Build
Company." Based in Malaga, Western Australia. Blu designs and builds commercial
fit-outs, retail displays, exhibition and event stands, shopping-centre
installations, and themed/experiential builds for brands and venues across Perth
and WA. Office line (08) 6285 0231 · info@blu.builders ·
instagram.com/blu.builders · open by appointment, Mon–Fri 9:30am–3:00pm AWST.

---

## 1. Executive Summary

Blu wins commercial creative-build work through a steady stream of enquiries,
but leads currently live in inboxes, Instagram DMs, notebooks, and people's
heads. Because most of Blu's work hangs on **fixed install, event, or launch
dates**, a missed follow-up isn't just a slower sale — it's often a lost job.

**Blu CRM** is a lightweight, mobile-first sales pipeline portal that gives the
three-person sales team (Andy, Kurt, Jess) one shared place to capture every
enquiry, move each opportunity through Blu's existing eight-stage pipeline, and
never drop a follow-up. Its headline differentiators are **deadline-driven
prioritisation** and a **Claude-powered AI assistant** that captures leads from
forwarded emails, drafts on-brand follow-ups, scores the pipeline, and answers
plain-English questions — using the proven artifact-chat pattern from Blu's
Billify invoicing app.

Scope is deliberately tight: **enquiry → won/lost**, then hand off to delivery.
Full project management, proposal building, and Xero invoicing integration are
explicitly deferred to V2+. The stack reuses Blu Shed's infrastructure exactly
(Next.js 16, Neon/Drizzle, Better Auth, Cloudflare Workers + R2), so the two
portals share patterns, cost almost nothing to run, and read as one family.

---

## 2. Background & Problem Statement

### 2.1 Current state

Blu wins work through brands, agencies, venues, referrals, and repeat clients,
arriving via the website, Instagram, and word of mouth — but there is no single
place to track them:

- **Leads are scattered** across inboxes, DMs, notebooks, and people's heads.
- **Follow-ups slip.** Concepts and quotes go out and nobody chases them.
- **Deadlines get missed.** Much of Blu's work is pinned to fixed install,
  event, or launch dates, so a missed follow-up can mean a missed deadline and
  a lost job.
- **No shared memory.** When a client comes back weeks later, no one can
  quickly see what was discussed, what was quoted, or whose lead it is.
- **No pipeline visibility.** There's no shared view of how much work is in the
  pipeline, what's likely to land, or which leads are going quiet.

### 2.2 Why now

The team already runs a disciplined manual process — the eight-stage pipeline,
a lead-intake template, and a weekly Monday pipeline report — but it lives in
documents and habit, not a system. Blu has also already proven the build
pattern: Blu Shed (inventory portal) and Billify (AI invoicing) share a stack
and an AI artifact-chat interaction model that Blu CRM can reuse wholesale,
cutting build risk and time dramatically.

### 2.3 Who is affected

A three-person sales-side team (owner, project manager, business development)
who work from phones — at venues, on site visits, and between meetings — plus
future read-only access for tradesmen and subcontractors.

---

## 3. Goals, Non-Goals & Success Metrics

### 3.1 Goals

1. **Capture every enquiry** in one system, regardless of channel, within one
   business day of receipt.
2. **Never drop a follow-up** — every open deal always has a next action,
   owner, and due date; overdue items are impossible to miss.
3. **Make deadlines visible** — fixed install/event/launch dates drive
   prioritisation across the whole pipeline.
4. **Give the team shared context** — anyone can open a client or deal and see
   the full history in under 30 seconds, including from a phone on site.
5. **Reduce admin time** — the AI assistant handles lead intake parsing,
   follow-up drafting, summaries, and the Monday report.
6. **Establish pipeline truth** — a trusted weekly view of open value, win
   rate, and forecast.

### 3.2 Non-Goals (explicitly out of scope for V1)

- Project/job management after a deal is won (Buildertrend/JobTread territory)
- Building quotes and proposals (cost templates, line items) — V1 tracks
  quotes, it doesn't build them
- Invoicing or accounting (Xero handoff is V2)
- Client-facing portal or e-signature
- Marketing automation, SMS/email sequences
- Two-way email sync at scale (V1 is forward/intake only)
- Offline mode
- Multi-currency, multi-region, multi-office

### 3.3 Success Metrics

| # | Metric | Baseline | Target (90 days post-launch) |
|---|--------|----------|------------------------------|
| M1 | Enquiries captured in CRM within 1 business day | Unknown (untracked) | 100% |
| M2 | Open deals with a defined next action + due date | ~0% (ad hoc) | 100% |
| M3 | Follow-ups overdue by more than 48 hours | Untracked | < 5% of due follow-ups |
| M4 | Deals going 7+ days with no contact | Untracked | < 10% of open deals at any time |
| M5 | Weekly Monday pipeline report produced | Manual, inconsistent | 100% of weeks, < 5 min to generate |
| M6 | Team adoption (weekly active users) | n/a | 3 of 3 core users |
| M7 | Time to summarise a client before a call | Minutes of digging | < 30 seconds (AI summary) |
| M8 | Win rate and lost reasons tracked | Not tracked | 100% of closed deals have outcome + reason |
| M9 | AI-assisted lead capture accuracy (fields correct without edit) | n/a | ≥ 80% of parsed fields accepted as-is |

Instrumentation to support these metrics is specified in §13.

---

## 4. Users, Personas & Roles

### 4.1 Roles & permissions

| Role | Description | Permissions |
|------|-------------|-------------|
| **Admin** | Owner / CEO (Andy Watson) | Full CRUD, manage users, configure pipeline stages, manage intake sources, view all deals and reports, final approvals, system settings |
| **Sales / Team Member** | Business development, project management, client comms | Create and manage deals and contacts, log activities, schedule follow-ups, send/track concepts and quotes, use the AI assistant |
| **Viewer** | (Future, V2) Read-only access for tradesmen, subcontractors, or partners | Browse assigned deals and contacts only |

### 4.2 Personas

**Andy Watson — Owner & CEO (Admin).** Holds the key client relationships and
gives final approvals. Needs: the Monday snapshot, total pipeline value at a
glance, confidence nothing is slipping, and the ability to reassign or
intervene on any deal. Primary device: phone, occasionally desktop.

**Kurt Weiss — Project Manager (Sales).** Scopes jobs, runs site visits,
receives the handover when a deal is won. Needs: fast capture in the field
(photos, voice notes, one-tap activity logging), deadline visibility, and a
clean "handover to delivery" signal on Won. Primary device: phone, on site,
sometimes with dirty or gloved hands.

**Jessica Rodin — Business Development & HR (Sales).** Owns lead intake,
follow-ups, and client comms. Needs: the intake inbox, the daily task list,
AI-drafted on-brand follow-ups, duplicate detection for repeat clients, and
quote-viewed alerts. Primary device: split phone/desktop.

Every deal carries an **owner** routed to Andy, Kurt, or Jess.

### 4.3 Authentication

Better Auth with the Drizzle adapter, on the same Neon PostgreSQL database.
Email/password with a magic-link option, plus **Microsoft 365 (Entra ID)
single sign-on** so the team logs in with their existing `@blu.builders`
accounts. Multi-user from day one. Session management, password reset, and
account lockout follow Better Auth defaults.

---

## 5. User Stories & Key Journeys

Stories are tagged with the requirement(s) in §6 that satisfy them.

### 5.1 Capture

- **US-01** — As Jess, when an enquiry email lands at info@blu.builders, I want
  it parsed into a pre-filled lead so I only confirm details rather than retype
  them. *(FR-3.3, FR-7.2)*
- **US-02** — As Kurt, standing in a shopping centre after a chance
  conversation, I want to quick-add a lead in under 60 seconds on my phone.
  *(FR-3.1, FR-10)*
- **US-03** — As Andy, I want web enquiries from blu.builders to appear in the
  CRM automatically, tagged by source, so nothing depends on someone checking
  an inbox. *(FR-3.2)*
- **US-04** — As Jess, when I add a contact who already exists, I want a
  warning before I create a duplicate, because repeat clients are common.
  *(FR-2.3)*

### 5.2 Work the pipeline

- **US-05** — As any team member, I want to drag a deal between stages on a
  kanban board and see per-stage value totals update. *(FR-1.1, FR-1.4)*
- **US-06** — As Kurt, between appointments, I want to move a deal forward and
  log "site visit done" with one tap from my phone. *(FR-4.3, FR-10)*
- **US-07** — As Jess, I want every deal to carry a next action and due date,
  and to see today's and overdue tasks the moment I open the app. *(FR-5.1, FR-5.2)*
- **US-08** — As Andy, I want deals with a fixed date within 14 days, or no
  contact for 7+ days, surfaced automatically regardless of stage. *(FR-5.3)*
- **US-09** — As Jess, when a client opens a quote we sent, I want an alert so
  I can follow up while it's top of mind. *(FR-6.2)*
- **US-10** — As Andy, when a deal is marked Won, I want a handover-to-delivery
  flag routed to Kurt; when Lost/Dormant, I want a reason recorded. *(FR-1.6)*

### 5.3 AI assistant

- **US-11** — As Jess, I want to paste a messy enquiry into chat and get a
  filled lead-intake artifact that asks me for anything missing. *(FR-7.2)*
- **US-12** — As Andy, I want to ask "which proposals have been quiet over a
  week?" and get matching deals as cards, not a wall of text. *(FR-7.1)*
- **US-13** — As Jess, I want a follow-up email drafted in Blu's voice, signed
  off with my details, that I can edit on the card before sending. *(FR-7.4)*
- **US-14** — As Kurt, on a site visit, I want to record a voice note and have
  it transcribed and filed as an activity on the right deal. *(FR-7.7)*
- **US-15** — As Andy, on Monday morning, I want the weekly pipeline report
  generated in Blu's existing format with one tap. *(FR-8.2)*
- **US-16** — As any user, when the AI is about to write or send something, I
  want a confirmation step so nothing happens behind my back. *(FR-7.8)*

### 5.4 Shared context

- **US-17** — As any team member, opening a contact, I want all their deals,
  quotes, activities, and notes rolled up in one place. *(FR-2.2)*
- **US-18** — As Andy, before a call, I want a one-tap AI summary of the client
  or deal. *(FR-7.6)*

---

## 6. Functional Requirements

Priorities: **P0** = must ship in V1; **P1** = should ship in V1, can slip a
sprint; **P2** = V2+. Each P0 requirement carries acceptance criteria (AC).

### FR-1. Deal Pipeline — P0

The home of the app. Each deal is a card; columns are pipeline stages.

**FR-1.1 Kanban board (P0).** Drag a card to move it between stages; works
with touch on mobile.
*AC: a stage change via drag persists, appears in the deal timeline with
timestamp and user, and updates column totals without a page reload.*

**FR-1.2 Blu's eight stages ship as the default board (P0):**

1. **Lead Captured** — initial enquiry received (web, Instagram, referral, repeat client)
2. **Qualified** — budget, timeline, site/venue, scope, and decision-maker confirmed
3. **Brief / Site Visit** — creative brief gathered, or site inspection booked/completed
4. **Concept / Quote Issued** — design direction and pricing prepared and sent
5. **Proposal Review** — client considering, follow-ups active
6. **Negotiation** — scope, budget, or timeline adjustments underway
7. **Won** — contract signed, handed to delivery
8. **Lost / Dormant** — declined, stalled, or parked (record reason)

**FR-1.3 Customisable stages (P1).** Admins can rename, reorder, add, or
remove stages; the board ships configured to the eight above.
*AC: renaming a stage preserves deal history; removing a stage requires
reassigning its deals.*

**FR-1.4 Per-stage value totals (P0).** Each column header shows the count
and total AUD value of deals in that stage.
*AC: totals reflect estimated value, or quoted value where a quote exists.*

**FR-1.5 Deal record (P0).** Fields: Lead ID (`BLU-[YYYY]-[###]`,
auto-generated, sequential per year), title (convention:
`Client name - Project name - Location`), estimated/quoted value (AUD), stage,
owner (Andy/Kurt/Jess), source (Web / Instagram / Referral / Repeat client /
Other), linked contact/company (brand), project type (Fit-out / Retail display /
Event stand / Exhibition / Install / Themed build / Other), venue/location,
scope summary, **fixed date(s)** (install / event / launch), decision-maker
confirmed (Y/N), expected close date, activity timeline, attached
concepts/quotes and files, notes.
*AC: Lead ID is unique and immutable; title convention is suggested via
placeholder/helper, not enforced.*

**FR-1.6 Won / Lost handling (P0).** Marking Won records the win and prompts
a **"handover to delivery"** flag routed to Kurt; full project delivery is out
of scope (§3.2). Marking Lost / Dormant prompts for a reason (price, timing,
went elsewhere, no response, parked).
*AC: a deal cannot enter Lost/Dormant without a reason; Won deals are excluded
from open-pipeline totals and included in win-rate reporting.*

**FR-1.7 Deadline awareness (P0).** The fixed-date field drives prioritisation
and surfaces deals whose deadline is near regardless of stage (see FR-5.3).

### FR-2. Contacts & Companies — P0

**FR-2.1 Contacts and companies (P0).** Contacts are individual people (brand
marketing managers, agency producers, venue/centre-management contacts,
on-site contacts). Companies are the brands, agencies, venues, and shopping
centres Blu builds for, plus referral partners. Contacts can belong to a
company.

**FR-2.2 Aggregated view (P0).** A contact record rolls up all of their deals,
activities, quotes, and notes in one place.
*AC: from a contact page, every linked deal and its current stage is reachable
in one tap.*

**FR-2.3 Duplicate detection (P0).** On add, match against existing
name/email/phone and warn before creating a duplicate.
*AC: an exact email or phone match always warns; fuzzy name match warns with
the candidate shown; the user can proceed deliberately.*

### FR-3. Lead Intake (four channels) — P0

**FR-3.1 Manual quick-add (P0).** A fast, large-target form (client/brand,
contact, project type, what they want, value guess) → drops straight onto the
board as Lead Captured.
*AC: completable in under 60 seconds on a phone; only client/brand and one
contact method are mandatory.*

**FR-3.2 Public web enquiry form (P0).** An embeddable form on blu.builders
posts new enquiries directly into the CRM, source tagged **Web**.
*AC: the public endpoint is write-only (cannot read CRM data), rate-limited,
and spam-protected (honeypot + server-side validation).*

**FR-3.3 Email-to-lead — Microsoft 365 / Outlook (P0).** Enquiries to
info@blu.builders (Exchange Online) are forwarded or synced into the CRM as
new leads; the AI assistant parses the email and pre-fills the lead-intake
template (FR-7.2). Captures forwarded Instagram and referral enquiries too.
*AC: a forwarded email produces a draft lead in the Inbox within 2 minutes;
parse failures still create a raw lead with the email body attached — no
enquiry is ever silently dropped.*

**FR-3.4 CSV import (P1).** Bulk-load existing contacts and open deals from a
spreadsheet (or M365 export), with column mapping (mirrors Blu Shed's CSV
import pattern).
*AC: import preview shows mapped columns and row count before commit;
duplicates are flagged using FR-2.3 rules.*

**FR-3.5 Leads inbox (P0).** New and unassigned leads from all channels land
in a single Inbox view for triage (assign owner, qualify, or discard).

### FR-4. Activities & Timeline — P0

**FR-4.1 Log interactions (P0).** Calls, emails, site visits, meetings, and
free-text notes, each timestamped and attributed to a team member.

**FR-4.2 Unified timeline (P0).** Every activity, stage change, quote event,
and note appears in one chronological feed on the deal and on the contact.

**FR-4.3 Quick log (P0).** One-tap actions ("Logged a call", "Site visit
done") optimised for phone use on site.
*AC: a quick-log action completes in two taps from the deal card.*

### FR-5. Tasks, Follow-ups & Reminders — P0

**FR-5.1 Due-dated follow-ups (P0).** Attach a next action and date to any
deal ("call back Thursday", "send revised quote").

**FR-5.2 Daily task list (P0).** Each user sees what's due today and what's
overdue.
*AC: overdue items are visually distinct and sort above today's items.*

**FR-5.3 Stale-deal and closing-soon alerts (P0).** Deals with **no contact
for 7+ days** surface as "needs attention" (matching Blu's weekly report);
any deal with a fixed date or decision within **14 days** surfaces as
"closing soon", regardless of stage.
*AC: both thresholds are admin-configurable; both lists are reachable from the
dashboard in one tap and feed the weekly report (FR-8.2).*

### FR-6. Quotes / Estimates (lightweight) — P0

**FR-6.1 Attach a quote (P0).** File plus value and status:
**Draft → Sent → Viewed → Accepted / Declined**. Accepted quote value rolls
into the deal and stage totals.

**FR-6.2 "Estimate viewed" alert (P0).** When a client opens a sent quote,
the owner is notified.
*AC: quote links are tokenised per recipient; a view event fires an in-app
notification to the deal owner within 1 minute.*

**FR-6.3 Quote builder (P2).** Full estimate/proposal builder with cost
templates, line items, and branded layouts is V2 — V1 tracks quotes, it
doesn't build them.

### FR-7. AI Assistant (headline feature) — P0

Powered by the Claude API via **tool use** — the assistant doesn't just
answer, it *acts* on the CRM through typed tools. The interaction model
follows the proven **artifact pattern** from Billify: a conversational chat
surface where the AI creates and modifies structured **artifacts** the user
can also edit directly.

**Artifact-based UI (modelled on Billify):**

- **Chat + artifacts** — built on `@assistant-ui/react` (shadcn.io/ai chat
  patterns). When the assistant creates or changes something, a rich,
  interactive **artifact card** renders inline — a deal, contact, quote, or
  report — not just a wall of text.
- **Two-way sync** — the headline behaviour. The AI drafts a deal or quote
  artifact; the user can edit fields directly on the card and changes sync
  back; the user can then ask the AI to revise it conversationally. Edits flow
  both directions, mediated through shared React contexts (the Billify
  `*-context.tsx` / `*-artifact-display.tsx` approach).
- **Tool use** — the model calls typed tools to create/update deals, contacts,
  activities, quotes, and follow-ups (mirroring Billify's
  `src/lib/ai/tools/*-tools.ts` + handler structure). **Tools are the only way
  the AI mutates data**, so every change is auditable.
- **Streaming + reasoning** — responses stream; the assistant can show its
  plan for multi-step actions.
- **Persisted threads** — conversations are saved as threads, with per-deal
  and per-contact chat history so context carries across sessions.

**Capabilities:**

**FR-7.1 Natural-language pipeline queries (P0).** "Which proposals have been
quiet over a week?", "what's in negotiation this month?", "show me Jess's open
leads", "what's closing in the next 14 days?" — answered against the live
pipeline, with matching deals rendered as artifacts.
*AC: queries resolve against live data via read tools (never stale snapshots);
zero-result queries say so plainly rather than inventing deals.*

**FR-7.2 Capture leads to the intake template (P0).** Paste or forward an
enquiry and the assistant fills Blu's lead-intake template (Lead ID, source,
client/brand, contact, project type, venue, scope, fixed dates, budget,
decision-maker, stage, owner, next action) as a deal artifact, **asking for
anything missing before saving**.
*AC: the assistant never invents budget, dates, venue, or decision-maker; if
absent from the source text it asks. Saving requires user confirmation.*

**FR-7.3 Create & modify via chat (P0).** "Log a new enquiry from Westfield
for a Christmas retail display at Carousel, about $40k, install by 01/11/2026"
spins up a deal artifact the team can fine-tune; "move it to Concept / Quote
Issued and set Kurt as owner" edits it in place.

**FR-7.4 On-brand follow-up drafting (P0).** Generate a follow-up email, SMS,
or call script as an editable artifact, in Blu's voice (see house rules),
signed off with the relevant team member's name and contact.

**FR-7.5 Lead scoring & prioritisation (P1).** Rank open deals by likelihood
to close, value, and **deadline pressure**. Scoring is explainable: the
assistant states *why* a deal ranks where it does.

**FR-7.6 History summaries (P0).** One-tap "summarise this client" or
"summarise this deal" for instant context before a call.

**FR-7.7 Voice note → logged activity (P1).** On a site visit, record a voice
note; the assistant transcribes it and files it as an activity artifact on the
right deal, with the original audio attached.
*AC: the user confirms the target deal before the activity saves.*

**FR-7.8 Confirmation gating (P0).** Actions that write or send (move a deal
to Won, send a follow-up, create a quote) surface a confirmation step before
they apply.
*AC: no tool with side effects executes without an explicit user confirmation
in the UI; read-only tools may run freely.*

**FR-7.9 Qualification help (P1).** Draft qualification questions, especially
around fixed event/install dates, venue/centre constraints, budget, and
decision-maker.

**FR-7.10 Concept / quote cover notes (P1).** Draft cover notes for concepts
and quotes (not the pricing itself).

**Brand voice & house rules (the assistant must follow):**

- Tone is **creative, confident, and polished** — Blu is "The Creative Build
  Company." No jargon, no hard-sell. Sign client comms off with the relevant
  team member's name and contact details.
- **Never use em dashes** in generated client-facing output.
- Currency in **AUD**, dates in **DD/MM/YYYY**, times in **AWST**.
- When key information is missing (budget, fixed date, venue, decision-maker),
  **ask before assuming**.
- Always recommend a **concrete next action and owner** for each lead.
- Treat all client and financial information as **Private and Confidential**.

**Guardrails, failure modes & quality (P0):**

- **Least-context principle** — each AI call receives only the deal/contact
  context needed for the task; no bulk export of the database to the model
  (§9.3).
- **Auditability** — every AI-initiated mutation is logged with thread ID,
  tool name, inputs, and the confirming user.
- **Graceful degradation** — if the Claude API is unavailable, all core CRM
  functions continue to work; the assistant surface shows a clear offline
  state. Email-to-lead falls back to raw-lead creation (FR-3.3 AC).
- **Prompt-injection posture** — content arriving from outside (enquiry
  emails, web-form text) is treated as data, never as instructions; the
  assistant must not act on directives embedded in client emails without
  user confirmation.
- **Evaluation set** — before launch, a fixture set of ~30 real (anonymised)
  enquiry emails and ~20 pipeline questions is used to measure parse accuracy
  (target ≥ 80% fields correct, metric M9) and query correctness; re-run on
  any model or prompt change.

### FR-8. Dashboard & Reporting — P0

**FR-8.1 Dashboard (P0).** Pipeline overview (total open value, value by
stage, deal count), win rate over a period with lost-reason breakdown,
activity volume per person, and a simple forecast (weighted pipeline value by
stage / expected close date). Default stage weightings are admin-editable.

**FR-8.2 Weekly Pipeline Report — Monday snapshot (P0).** A one-tap (or
scheduled) report the AI assistant generates in Blu's existing format:

1. **Summary** — active leads, total weighted value, new this week, won, lost/dormant
2. **Closing soon** — deadline or decision within 14 days
3. **Needs attention** — no contact 7+ days, or stalled
4. **Full pipeline by stage** — counts and lists per stage
5. **Won this week** — value and handover-to-delivery status
6. **Lost / dormant this week** — with reason
7. **Actions for the week** — owner, action, due date

Generated as an artifact the team can review, edit, and share.
*AC: report numbers reconcile exactly with the dashboard for the same period.*

### FR-9. Documents & Photos — P0

Attach plans, site photos, quotes, and contracts to deals; snap site photos
directly from the phone camera. Storage on Cloudflare R2 (`PHOTO_BUCKET`
binding), reusing Blu Shed's optimised upload pipeline.
*AC: uploads from a 4G connection of a typical phone photo complete in < 10s
with progress shown; files are private by default and served via signed URLs.*

### FR-10. Mobile-First Capture — P0

Built for the field: quick-add a deal, log a site visit, snap a photo, or drop
a voice note, all with large touch targets that work with dirty or gloved
hands. Stage updates from the truck — move a deal forward between appointments
without opening a laptop. (Quantified targets in §9.2.)

### FR-11. Notifications

**FR-11.1 In-app (P0):** follow-up due/overdue, stale-deal nudges,
estimate-viewed, new lead assigned.
**FR-11.2 Email and push delivery (P2)** of the same events.

---

## 7. Data Model (conceptual)

Entities and key relationships; field detail lives in FR-1.5 and the schema.

```
User ──────────< Deal >────────── Company
                  │  \              │
                  │   \────────── Contact (belongs to Company, 0..1)
                  │
                  ├──< Activity (call / email / site visit / meeting / note /
                  │              stage change / quote event — the timeline)
                  ├──< Task / Follow-up (action, owner, due date, done)
                  ├──< Quote (file, value AUD, status: Draft→Sent→Viewed→
                  │           Accepted/Declined, viewed-at, token)
                  ├──< Attachment (R2 object: photo, plan, contract)
                  └──< AIThread ──< AIMessage / ToolCall (audit trail)

PipelineStage (ordered, admin-configurable; deals reference by ID)
LeadSource (Web / Instagram / Referral / Repeat client / Other)
Notification (user, type, payload, read-at)
```

Conventions: all money in AUD as integer cents; all timestamps stored UTC,
displayed AWST; soft-delete on Deals, Contacts, Companies (no hard deletes in
V1); every mutation carries `created_by` / `updated_by`.

---

## 8. Information Architecture

```
Home / Dashboard (pipeline summary + AI assistant entry point)
├── Pipeline (kanban board)
│   └── Deal Detail
│       ├── Timeline (activities, stage changes, quote events)
│       ├── Quotes
│       ├── Files & Photos
│       └── Follow-ups / Tasks
├── Contacts
│   ├── Companies
│   └── Contact Detail → linked deals, activities, notes
├── Inbox / Leads (new + unassigned, from all four intake channels)
├── Tasks (my follow-ups: today / overdue / upcoming)
├── AI Assistant (chat + interactive artifacts: create/edit deals,
│       contacts, quotes, reports with two-way sync; persisted threads)
├── Reports (pipeline value, win rate, activity, forecast, weekly report)
└── Settings (admin)
    ├── Users & Roles
    ├── Pipeline Stages
    ├── Lead Intake (web form embed, email intake address)
    ├── CSV Import / Export
    └── AI Assistant config (provider, model)
```

---

## 9. Non-Functional Requirements

### 9.1 Performance

- Search / pipeline filter results in < 200ms (server time, warm)
- Page loads in < 1.5s on 4G mobile (LCP, p75)
- Every server-rendered route shows an immediate skeleton loading state
  (App Router `loading.tsx`) shaped like the destination page while data is
  fetched — no blank screens or layout jumps during navigation
- AI assistant first token streamed in < 3s for typical queries
- Kanban drag interaction at 60fps on a mid-range phone

### 9.2 Mobile-First & Accessibility

- Designed for phone and tablet — used on site and on the move
- Touch-friendly targets (minimum 44px); works with dirty/gloved hands —
  large tap zones, minimal precision required
- Camera and microphone access for photo capture and voice notes
- WCAG 2.1 AA colour contrast on the dark theme; all core flows operable
  without drag (stage change also available via a menu) for accessibility and
  one-handed use

### 9.3 Privacy, Security & Data

- Client contact data is sensitive — visibility restricted by role; the public
  web form writes in but cannot read.
- AI calls send only the necessary deal/contact context; **no bulk export of
  the database to the model**.
- **Australian Privacy Act 1988 (APPs) posture:** collect only what's needed
  for sales contact; personal information used for the purpose collected;
  contacts can be corrected or deleted on request (soft-delete + purge
  procedure); data stored with Neon and Cloudflare under their standard
  safeguards — hosting regions chosen as close to Australia as the providers
  allow, documented at build time.
- Transport security: HTTPS everywhere; signed URLs for R2 objects; tokenised
  quote-view links that expose only the quote, never the CRM.
- Secrets in Cloudflare/Wrangler secret bindings, never in the repo.
- Audit trail on all mutations (human and AI) per §7 conventions.
- Backups: Neon point-in-time recovery enabled; restore procedure documented
  and tested once before launch.

### 9.4 Reliability

- Target 99.5% availability for the core CRM (Cloudflare Workers + Neon
  baseline); AI assistant degradation does not take down core CRM (FR-7
  guardrails).
- Email-to-lead is at-least-once: failures retry and never silently drop an
  enquiry.

### 9.5 Conventions & House Rules (app-wide)

- **Locale:** currency in AUD, dates DD/MM/YYYY, times AWST (Perth).
- **Confidentiality:** all client and financial data is Private and
  Confidential; visibility is role-restricted.
- **Region:** single-office WA business; no multi-currency or multi-region.
- The AI assistant inherits these plus the brand-voice rules in FR-7.

### 9.6 Testing Strategy

- End-to-end browser testing uses **Playwright**.
- Core coverage: pipeline drag-and-stage-change, all four lead-intake paths,
  follow-up creation and overdue surfacing, quick-add deal, quote status +
  viewed alert, and an AI assistant query (with mocked model responses for
  determinism).
- AI quality is covered separately by the evaluation set in FR-7 (real model,
  fixture inputs, scored outputs).
- Test runs cover mobile-first viewports (common phone and tablet sizes).
- Unit tests on Lead ID generation, duplicate detection, stage-total maths,
  weighted forecast, and stale/closing-soon threshold logic.

---

## 10. Tech Stack & Architecture

Decision: **reuse Blu Shed's stack exactly** so the two portals share
patterns, infrastructure, and operating knowledge.

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 (App Router) on React 19 |
| Language | TypeScript |
| Linting/Formatting | Biome via Ultracite |
| UI Components | shadcn/ui with Base UI primitives |
| Styling | Tailwind CSS 4 |
| E2E Testing | Playwright |
| Database | Neon PostgreSQL (serverless) with Drizzle ORM |
| Auth | Better Auth with Drizzle adapter — email/magic-link + **Microsoft 365 (Entra ID) SSO** |
| Email / Calendar | Microsoft 365 (Outlook / Exchange Online) for email-to-lead intake; Outlook calendar sync (V2) |
| Accounting | **Xero** — Won-deal → invoice handoff (V2) |
| AI Assistant | Anthropic Claude API (tool use + streaming) |
| AI Chat UI | `@assistant-ui/react` with artifact cards (shadcn.io/ai patterns), two-way sync via React contexts — the Billify pattern |
| File / Photo Storage | Cloudflare R2 (`PHOTO_BUCKET` binding) |
| Hosting | Cloudflare Workers via `@opennextjs/cloudflare` + `wrangler` |
| Domain | TBD (`blu-crm` subdomain initially) |

Architecture notes: server actions / route handlers gate all writes through
the same validation layer the AI tools use, so human edits and AI tool calls
share one code path. The public enquiry-form endpoint and the quote-view
endpoint are the only unauthenticated surfaces, both write-only or
single-object-read respectively.

---

## 11. Design Direction

**Aesthetic:** Creative-studio polish meets a fast working tool. Blu is "The
Creative Build Company", so the CRM should feel confident and considered —
more design studio than industrial workshop — while sharing the Blu brand blue
with Blu Shed so the portals read as one family.

- **Palette:** Dark charcoal base with Blu Builders brand blue as the primary
  accent. Clear, high-contrast stage colours on the pipeline board.
- **Typography:** A confident display font paired with a highly legible body
  font, readable at arm's length on a phone.
- **Layout:** Card-based pipeline, generous touch targets, minimal nesting.
- **Vibe:** Fast, direct, and zero fluff, but polished enough to feel on-brand
  for a studio that builds eye-catching brand and retail experiences.

---

## 12. Release Plan

### 12.1 Milestones

| Milestone | Contents | Exit criteria |
|-----------|----------|---------------|
| **M0 — Foundations** | Repo, stack scaffold, auth (email + M365 SSO), roles, data model, CI + Playwright harness | All three users can sign in with @blu.builders; schema migrated on Neon |
| **M1 — Pipeline core** | Kanban + 8 stages, deal record, stage totals, contacts/companies + duplicate detection, activities/timeline, manual quick-add | US-02, 04, 05, 17 pass E2E |
| **M2 — Never drop a follow-up** | Tasks/follow-ups, daily list, stale + closing-soon alerts, in-app notifications, Won/Lost handling | US-07, 08, 10 pass; M2/M3 metrics measurable |
| **M3 — Intake everywhere** | Web enquiry form, email-to-lead, Leads inbox, CSV import; quotes + viewed alert; documents/photos on R2 | US-01, 03, 09 pass; live form on blu.builders |
| **M4 — AI assistant** | Chat + artifacts, tool layer, confirmation gating, NL queries, lead capture, follow-up drafting, summaries, threads; eval set passing | US-11–13, 16, 18 pass; M9 ≥ 80% on fixtures |
| **M5 — Reporting & launch** | Dashboard, forecast, weekly Monday report, voice notes, lead scoring, polish, data import of existing leads, team onboarding | Andy signs off; first real Monday report generated |

Sequencing principle: the team gets a usable pipeline at M1 and real
follow-up safety at M2 — value lands before the AI does.

### 12.2 V1 scope summary (in)

Better Auth + multi-user (admin + sales) · kanban pipeline with customisable
stages and per-stage totals · contacts & companies with aggregated history and
duplicate detection · all four intake channels · activities & unified timeline
· tasks, follow-ups, reminders, stale-deal alerts · lightweight quotes with
viewed alert · AI assistant with artifact chat (tool use, two-way sync,
confirmation gating, persisted threads; NL queries, conversational create/edit,
follow-up drafting, lead scoring, summaries, voice-note logging) · dashboard &
reporting incl. weekly report · documents & photos (R2) · mobile-first capture
· in-app notifications · CSV import/export.

### 12.3 Deferred to V2+

- Full estimate / proposal builder (cost templates, line items, branded layouts)
- Two-way email sync and automatic activity logging at scale
- Project / job tracking and full ops handover (where Buildertrend / JobTread
  play — Blu CRM stays sales-focused)
- Client portal · e-signature on quotes/contracts
- **Xero integration** — push a Won deal (client + value) to Xero to raise the
  invoice; sync invoice/payment status back onto the deal
- Outlook calendar sync (site visits, deadlines)
- SharePoint / OneDrive document sync
- SMS / email automation sequences
- Viewer role (tradesmen Silas & Oliver, painter Sharmaine, subcontractors)
- Email & push notifications
- Offline mode (service-worker cache for read-only pipeline and contact browsing)

---

## 13. Analytics & Instrumentation

Lightweight, privacy-respecting product analytics to prove the success metrics:

- Event log: lead created (by channel), deal stage changed, follow-up
  created/completed/overdue, quote sent/viewed/accepted, AI tool call
  confirmed/rejected, AI parse accepted-as-is vs edited, report generated,
  session per user.
- A small internal metrics page (admin-only) renders M1–M9 from these events —
  no third-party analytics required in V1.

---

## 14. Risks & Mitigations

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|-----------|--------|------------|
| R1 | Team doesn't adopt — falls back to inboxes and notebooks | Med | High | Mobile-first quick capture (< 60s), email-to-lead so the old habit feeds the new system, Andy runs Monday report from the CRM only |
| R2 | AI parses enquiries wrongly and erodes trust | Med | Med | Ask-before-assume rule, confirmation gating, eval set with ≥ 80% bar, fall back to raw lead on parse failure |
| R3 | Email-to-lead integration friction with M365 | Med | Med | Start with simple forwarding address; Graph API sync only if forwarding proves insufficient |
| R4 | Scope creep toward project management | High | Med | §3.2 non-goals and the V2 boundary in §12.3 are the contract; "handover to delivery" flag is the only ops hook |
| R5 | Claude API cost or latency spikes | Low | Med | Least-context prompts, streaming, model configurable in Settings, core CRM unaffected by AI outage |
| R6 | Public web form abused (spam) | Med | Low | Rate limiting, honeypot, write-only endpoint, inbox triage step |
| R7 | Single developer / bus factor on Blu Shed patterns | Med | Med | Reuse documented patterns; keep README + ADRs for deviations |
| R8 | Quote-viewed tracking blocked by client mail/security scanners | Med | Low | Treat "viewed" as a signal, not truth; never auto-action on it |

---

## 15. Dependencies & Assumptions

- Blu Shed codebase and patterns (CSV import, R2 upload pipeline) are
  available to reuse.
- Billify's AI artifact pattern (`@assistant-ui/react`, tool handlers, context
  sync) is stable and portable.
- Microsoft 365 tenant for blu.builders exists with admin access for Entra ID
  app registration and a forwarding rule on info@blu.builders.
- Anthropic API key and budget approved for V1 usage.
- Existing leads/contacts are available in spreadsheet form for the M5 import.
- Free/low tiers (Neon, R2, Cloudflare Workers) suffice for a 3-user team —
  validated at M0.

---

## 16. Open Questions

| # | Question | Owner | Needed by |
|---|----------|-------|-----------|
| Q1 | Email-to-lead: simple forwarding rule vs Microsoft Graph subscription — which first? | Kurt | M3 |
| Q2 | Stage weightings for the forecast — what defaults reflect Blu's actual conversion? | Andy | M5 |
| Q3 | Voice-note transcription path — Claude-side vs device/browser speech API? | Kurt | M4 |
| Q4 | Does the public web form replace or duplicate the existing blu.builders contact form? | Jess | M3 |
| Q5 | Retention/purge policy for lost-deal personal data under APPs — how long do we keep dormant contacts? | Andy | Launch |
| Q6 | Brand blue exact token + display font — confirm from Blu brand assets | Andy | M1 |

---

## 17. Competitor Positioning

| Product | Positioning | What Blu CRM borrows |
|---------|-------------|----------------------|
| **Pipedrive** | Visual deal-pipeline CRM + AI sales assistant | Kanban stages, per-stage value totals, AI deal prioritisation |
| **Followup CRM** | Bid/sales-focused construction CRM | Follow-up scheduling, estimate-viewed alerts, win-rate reporting |
| **JobNimbus** | Trade sales CRM, strong mobile | On-site mobile capture: stage updates and photos from the field |
| **Buildertrend / JobTread** | Full project-management suites (estimating, scheduling, client portal) | **Deliberately out of V1 scope** — marks the V2+ boundary |
| **2026 AI-CRM trend** | NL search, auto-logging, lead scoring, AI drafting | NL pipeline queries, follow-up drafting, lead scoring, summaries |

Blu CRM positions in the **sales-focused tier** (Pipedrive / Followup CRM)
rather than the heavyweight build-management suites: it owns the journey from
enquiry to won, then hands off. Blu's work is **commercial creative builds**
(fit-outs, retail, events, exhibitions), not residential home building, so the
generic deal-pipeline model fits more naturally than trade-specific suites.
The differentiators Blu cares about are **deadline-driven prioritisation** and
an **AI assistant that already knows how Blu sells**.

**Build-vs-buy note:** Pipedrive at ~3 seats would cost less than the build in
pure dollars, but would not encode Blu's intake template, fixed-date
prioritisation, Monday report format, or brand voice — and Blu already owns
the stack, patterns, and AI interaction model from Blu Shed and Billify,
collapsing the build cost. The bespoke route is justified by fit, not price.

---

## 18. Resolved Decisions

| # | Decision | Answer |
|---|----------|--------|
| 1 | App name | **Blu CRM** |
| 1a | Business | **Blu.Builders Pty Ltd** (ACN 670 602 847), Malaga WA — commercial fit-outs, retail, events, exhibitions, themed builds across Perth/WA |
| 2 | Central object | **Deals / opportunities** — the kanban pipeline is the hub; contacts and activities hang off deals |
| 2a | Pipeline stages | **Blu's existing 8 stages** ship as the default board (Lead Captured → … → Won / Lost-Dormant); customisable |
| 3 | Scope boundary | **Sales pipeline only** (enquiry → won/lost) with a lightweight "hand to ops" hook; full project management deferred to V2 |
| 4 | AI | **AI-forward in V1** — the Claude-powered assistant is a headline feature, not deferred |
| 4a | AI UI pattern | **Artifact-based chat** modelled on Blu's Billify app (`@assistant-ui/react`, tool use, two-way artifact sync) — AI creates/modifies deals, contacts, quotes and reports as editable artifacts |
| 5 | Lead intake | **All four channels** in V1 — manual quick-add, public web form, email-to-lead, CSV import |
| 6 | Auth | **Better Auth** on Neon, multi-user, plus **Microsoft 365 (Entra ID) SSO** for `@blu.builders` accounts |
| 7 | Tech stack | **Reuse Blu Shed's stack exactly** so the two portals share patterns and infra |
| 8 | File storage | **Cloudflare R2** (reuse `PHOTO_BUCKET` upload pipeline) |
| 9 | Email intake | **Microsoft 365 / Outlook** (info@blu.builders) feeds email-to-lead |
| 10 | Accounting | **Xero** is Blu's invoicing system; Won-deal → Xero invoice handoff is a V2 integration |
| 11 | Locale | AUD currency, DD/MM/YYYY dates, AWST times; single WA office |
| 12 | Hosting / budget | **Cloudflare Workers**, free/low tiers where possible (Neon, R2, Cloudflare) |
| 13 | Domain | **`blu-crm` subdomain** initially; custom domain later if needed |

---

## 19. Glossary

- **Deal** — a sales opportunity; the central object. One enquiry = one deal.
- **Lead ID** — `BLU-[YYYY]-[###]`, the deal's permanent reference.
- **Fixed date** — a client-side install, event, or launch date the job must hit.
- **Stale deal** — open deal with no logged contact for 7+ days.
- **Closing soon** — deal with a fixed date or decision due within 14 days.
- **Artifact** — an interactive card the AI assistant creates or edits in chat
  (deal, contact, quote, report) with two-way sync to the database.
- **Handover to delivery** — the flag raised on Won that passes the job to ops
  (Kurt); the boundary of Blu CRM's scope.
- **Weighted value** — deal value × stage probability, used in the forecast.

---