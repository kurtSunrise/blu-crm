# Blu CRM — Client & Sales Pipeline Portal

## Product Requirements Document

**Version:** 0.1
**Date:** 10 June 2026
**Author:** Blu Builders

**Business:** Blu.Builders Pty Ltd (ACN 670 602 847) — "The Creative Build
Company." Based in Malaga, Western Australia. Blu designs and builds commercial
fit-outs, retail displays, exhibition and event stands, shopping-centre
installations, and themed/experiential builds for brands and venues across Perth
and WA. Office line (08) 6285 0231 · info@blu.builders ·
instagram.com/blu.builders · open by appointment, Mon–Fri 9:30am–3:00pm AWST.

---

## 1. Problem

Blu wins work through a steady stream of enquiries — brands, agencies, venues,
referrals, and repeat clients, arriving via the website, Instagram, and word of
mouth — but there is no single place to track them. Leads live in inboxes,
DMs, notebooks, and people's heads. Follow-ups slip. Concepts and quotes go out
and nobody chases them. Much of Blu's work is pinned to **fixed install, event,
or launch dates**, so a missed follow-up can mean a missed deadline and a lost
job. When a client comes back weeks later, no one can quickly see what was
discussed, what was quoted, or whose lead it is. And there's no shared view of
how much work is in the pipeline, what's likely to land, or which leads are
going quiet.

## 2. Solution

**Blu CRM** — a lightweight, mobile-first web portal that gives the team one
place to capture every enquiry, move each opportunity through Blu's sales
pipeline, and never drop a follow-up. It is **deals-centric** (the pipeline is
the hub), **AI-forward** (a Claude-powered assistant logs leads, drafts
on-brand follow-ups, scores the pipeline, and answers plain-English questions),
and built for use on a phone — at a venue, on a site visit, or between meetings.
It encodes how Blu already works: the eight-stage pipeline, the lead-intake
template, deadline-aware prioritisation, and the weekly Monday pipeline report.

## 3. Users & Roles

| Role | Description | Permissions |
|------|-------------|-------------|
| **Admin** | Owner / CEO (Andy Watson) | Full CRUD, manage users, configure pipeline stages, manage intake sources, view all deals and reports, final approvals, system settings |
| **Sales / Team Member** | Business development, project management, client comms | Create and manage deals and contacts, log activities, schedule follow-ups, send/track concepts and quotes, use the AI assistant |
| **Viewer** | (Future) Read-only access for tradesmen, subcontractors, or partners | Browse assigned deals and contacts only |

**Core team (initial users & lead owners):**
- **Andy Watson** — Owner & CEO (final approvals, key client relationships). Admin.
- **Kurt Weiss** — Project Manager (scoping, site visits, delivery handover).
- **Jessica Rodin** — Business Development & HR (lead intake, follow-ups, client comms).
- Tradesmen (Silas, Oliver) and painter (Sharmaine) are future Viewer-role users.

Every deal carries an **owner** routed to Andy, Kurt, or Jess.

**Auth:** Better Auth with the Drizzle adapter, on the same Neon PostgreSQL
database. Email/password with a magic-link option, plus **Microsoft 365
(Entra ID) single sign-on** so the team logs in with their existing
`@blu.builders` accounts. Multi-user from day one.

## 4. Core Features

### 4.1 Deal Pipeline
- **Kanban board** — the home of the app. Each deal is a card; columns are
  pipeline stages. Drag a card to move it between stages.
- **Blu's eight stages** (the default board):
  1. **Lead Captured** — initial enquiry received (web, Instagram, referral, repeat client)
  2. **Qualified** — budget, timeline, site/venue, scope, and decision-maker confirmed
  3. **Brief / Site Visit** — creative brief gathered, or site inspection booked/completed
  4. **Concept / Quote Issued** — design direction and pricing prepared and sent
  5. **Proposal Review** — client considering, follow-ups active
  6. **Negotiation** — scope, budget, or timeline adjustments underway
  7. **Won** — contract signed, handed to delivery
  8. **Lost / Dormant** — declined, stalled, or parked (record reason)
- **Customizable stages** — admins can rename, reorder, add, or remove stages,
  but the board ships configured to the eight above.
- **Deal naming convention** — at Lead Captured, name the deal
  `Client name - Project name - Location` so deals read consistently across the
  board. Each deal also gets a **Lead ID** in the form `BLU-[YYYY]-[###]`.
- **Per-stage value totals** — each column header shows the count and total AUD
  value of deals in that stage, so the team can see exactly where potential
  revenue sits.
- **Deal record fields:** Lead ID, title, estimated/quoted value (AUD), stage,
  owner (Andy/Kurt/Jess), source (Web / Instagram / Referral / Repeat client /
  Other), linked contact/company (brand), **project type** (Fit-out / Retail
  display / Event stand / Exhibition / Install / Themed build / Other),
  venue/location, scope summary, **fixed date(s)** (install / event / launch),
  decision-maker confirmed (Y/N), expected close date, activity timeline,
  attached concepts/quotes and files, notes.
- **Deadline awareness** — because much of Blu's work hangs on fixed install or
  event dates, the fixed-date field drives prioritisation and surfaces deals
  whose deadline is near regardless of stage.
- **Won / Lost handling** — marking Won records the win and prompts a
  **"handover to delivery"** flag (Kurt) so the job can be passed on; full
  project delivery is out of scope (see §9). Marking **Lost / Dormant** prompts
  for a reason (price, timing, went elsewhere, no response, parked).

### 4.2 Contacts & Companies
- **Contacts** — individual people (brand marketing managers, agency producers,
  venue/centre-management contacts, on-site contacts).
- **Companies** — the brands, agencies, venues, and shopping centres Blu builds
  for, plus referral partners. Contacts can belong to a company.
- **Aggregated view** — a contact record rolls up all of their deals,
  activities, quotes, and notes in one place, so anyone can see the full history
  at a glance.
- **Duplicate detection** — on add, match against existing name/email/phone and
  warn before creating a duplicate (repeat clients are common at Blu).

### 4.3 Lead Intake (four channels)
- **Manual quick-add** — a fast, large-target form to capture a lead on the spot
  (client/brand, contact, project type, what they want, value guess) → drops
  straight onto the board as **Lead Captured**.
- **Public web enquiry form** — an embeddable form on blu.builders posts new
  enquiries directly into the CRM, source tagged **Web**.
- **Email-to-lead (Microsoft 365 / Outlook)** — enquiries to info@blu.builders
  (Outlook/Exchange Online) are forwarded or synced into the CRM as new leads;
  the AI assistant parses the email and pre-fills the lead-intake template
  (see §4.7). Captures the **Instagram** and **Referral** enquiries the team
  forwards in, too.
- **CSV import** — bulk-load existing contacts and open deals from a spreadsheet
  (or M365 export), with column mapping (mirrors Blu Shed's CSV import pattern).

### 4.4 Activities & Timeline
- **Log interactions** — calls, emails, site visits, meetings, and free-text
  notes, each timestamped and attributed to a team member.
- **Unified timeline** — every activity, stage change, quote event, and note
  appears in one chronological feed on the deal and on the contact.
- **Quick log** — one-tap actions ("Logged a call", "Site visit done") optimised
  for phone use on site.

### 4.5 Tasks, Follow-ups & Reminders
- **Due-dated follow-ups** — attach a next action and date to any deal ("call
  back Thursday", "send revised quote").
- **Daily task list** — each user sees what's due today and what's overdue.
- **Stale-deal alerts** — deals with **no contact for 7+ days** surface as
  "needs attention" (matching Blu's weekly report), and any deal with a fixed
  date or decision within **14 days** surfaces as "closing soon", so nothing
  goes cold and no deadline is missed.

### 4.6 Quotes / Estimates (lightweight)
- **Attach a quote** to a deal — file plus value and status:
  **Draft → Sent → Viewed → Accepted / Declined**.
- **"Estimate viewed" alert** — when a client opens a sent quote, the owner is
  notified so they can follow up while it's top of mind.
- **Quote value feeds the pipeline** — accepted quote value rolls into the deal
  and stage totals.
- *Full estimate/proposal builder with cost templates and line items is V2 (see
  §9) — V1 tracks quotes, it doesn't build them.*

### 4.7 AI Assistant (headline feature)
Powered by the Claude API via **tool use** — the assistant doesn't just answer,
it *acts* on the CRM through typed tools. The interaction model follows the
proven **artifact pattern** from Billify (Blu Builders' invoicing app): a
conversational chat surface where the AI creates and modifies structured
**artifacts** the user can also edit directly.

**Artifact-based UI (modelled on Billify):**
- **Chat + artifacts** — built on `@assistant-ui/react` (shadcn.io/ai chat
  patterns). The user talks to the assistant; when it creates or changes
  something, a rich, interactive **artifact card** renders inline — a deal, a
  contact, a quote, or a report — not just a wall of text.
- **Two-way sync** — the headline behaviour. The AI drafts a deal or quote
  artifact; the user can edit fields directly on the card and changes sync back;
  the user can then ask the AI to revise it conversationally. Edits flow both
  directions, mediated through shared React contexts (the Billify
  `*-context.tsx` / `*-artifact-display.tsx` approach).
- **Tool use** — the model calls typed tools to create/update deals, contacts,
  activities, quotes, and follow-ups (mirroring Billify's
  `src/lib/ai/tools/*-tools.ts` + handler structure). Tools are the only way the
  AI mutates data, so every change is auditable.
- **Confirmation gating** — actions that write or send (move a deal to Won, send
  a follow-up, create a quote) surface a confirmation step before they apply.
- **Streaming + reasoning** — responses stream; the assistant can show its
  plan / chain-of-thought for multi-step actions.
- **Persisted threads** — conversations are saved as threads, with per-deal and
  per-contact chat history so context carries across sessions.

**What the assistant does:**
- **Natural-language pipeline queries** — "which proposals have been quiet over a
  week?", "what's in negotiation this month?", "show me Jess's open leads",
  "what's closing in the next 14 days?" — answered against the live pipeline,
  with matching deals rendered as artifacts.
- **Capture leads to the intake template** — paste or forward an enquiry and the
  assistant fills Blu's **lead-intake template** (Lead ID, source, client/brand,
  contact, project type, venue, scope, fixed dates, budget, decision-maker,
  stage, owner, next action) as a deal artifact, asking for anything missing
  before saving.
- **Create & modify via chat** — "log a new enquiry from Westfield for a
  Christmas retail display at Carousel, about $40k, install by 01/11/2026" spins
  up a deal artifact the team can fine-tune; "move it to Concept / Quote Issued
  and set Kurt as owner" edits it in place.
- **Qualification help** — draft qualification questions, especially around
  fixed event/install dates, venue/centre constraints, budget, and
  decision-maker.
- **On-brand follow-up drafting** — generate a follow-up email, SMS, or call
  script as an editable artifact, in Blu's warm, creative, professional studio
  voice, signed off with the relevant team member's name and contact.
- **Lead scoring & prioritisation** — rank open deals by likelihood to close,
  value, and **deadline pressure**, so the team works the hottest ones first.
- **History summaries** — one-tap "summarise this client" or "summarise this
  deal" for instant context before a call.
- **Concept / quote cover notes** — draft cover notes for concepts and quotes
  (not the pricing itself).
- **Voice note → logged activity** — on a site visit, record a voice note; the
  assistant transcribes it and files it as an activity artifact on the right deal.

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

### 4.8 Dashboard & Reporting
- **Pipeline overview** — total open value, value by stage, deal count.
- **Win rate** — won vs. lost over a period, with lost-reason breakdown.
- **Activity volume** — calls/visits/quotes logged per person.
- **Simple forecast** — weighted pipeline value by stage / expected close date.
- **Weekly Pipeline Report (Monday snapshot)** — a one-tap (or scheduled)
  report the AI assistant can generate in Blu's existing format:
  1. **Summary** — active leads, total weighted value, new this week, won,
     lost/dormant
  2. **Closing soon** — deadline or decision within 14 days
  3. **Needs attention** — no contact 7+ days, or stalled
  4. **Full pipeline by stage** — counts and lists per stage
  5. **Won this week** — value and handover-to-delivery status
  6. **Lost / dormant this week** — with reason
  7. **Actions for the week** — owner, action, due date
  Generated as an artifact the team can review, edit, and share.

### 4.9 Documents & Photos
- **Attach to deals** — plans, site photos, quotes, contracts.
- **Camera capture** — snap site photos directly from the phone.
- **Storage** — Cloudflare R2 (`PHOTO_BUCKET` binding), reusing Blu Shed's
  optimised upload pipeline.

### 4.10 Mobile-First Capture
- **Built for the field** — quick-add a deal, log a site visit, snap a photo, or
  drop a voice note, all with large touch targets that work with dirty or gloved
  hands.
- **Stage updates from the truck** — move a deal forward between appointments
  without opening a laptop.

### 4.11 Notifications
- **V1 (in-app):** follow-up due/overdue, stale-deal nudges, estimate-viewed,
  new lead assigned.
- **V2:** email and push delivery of the same events.

## 5. Non-Functional Requirements

### 5.1 Performance
- Search / pipeline filter results in < 200ms
- Page loads in < 1.5s on 4G mobile
- AI assistant first response streamed in < 3s for typical queries

### 5.2 Mobile-First
- Designed for phone and tablet — used on site and on the move
- Touch-friendly targets (minimum 44px)
- Works with dirty/gloved hands — large tap zones, minimal precision required
- Camera and microphone access for photo capture and voice notes

### 5.3 Privacy & Data
- Client contact data is sensitive — restrict visibility by role; the public web
  form writes in but cannot read.
- AI calls send only the necessary deal/contact context; no bulk export of the
  database to the model.

### 5.4 Offline Consideration (Future)
- V1 requires connectivity. Future: service-worker cache for read-only pipeline
  and contact browsing.

### 5.5 Conventions & House Rules (app-wide)
- **Locale:** currency in AUD, dates DD/MM/YYYY, times AWST (Perth).
- **Confidentiality:** all client and financial data is Private and Confidential;
  visibility is role-restricted.
- **Region:** single-office WA business; no multi-currency or multi-region needs.
- The AI assistant inherits these plus the brand-voice rules in §4.7 (including
  no em dashes in client-facing output).

### 5.6 Testing Strategy
- End-to-end browser testing uses **Playwright**
- Core coverage: pipeline drag-and-stage-change, all four lead-intake paths,
  follow-up creation and overdue surfacing, quick-add deal, quote status +
  viewed alert, and an AI assistant query
- Test runs cover mobile-first viewports (common phone and tablet sizes)

## 6. Tech Stack

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

## 7. Information Architecture

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
├── Reports (pipeline value, win rate, activity, forecast)
└── Settings (admin)
    ├── Users & Roles
    ├── Pipeline Stages
    ├── Lead Intake (web form embed, email intake address)
    ├── CSV Import / Export
    └── AI Assistant config (provider, model)
```

## 8. Design Direction

**Aesthetic:** Creative-studio polish meets a fast working tool. Blu is "The
Creative Build Company", so the CRM should feel confident and considered — more
design studio than industrial workshop — while sharing the Blu brand blue with
Blu Shed so the portals read as one family.

- **Palette:** Dark charcoal base with Blu Builders brand blue as the primary
  accent. Clear, high-contrast stage colours on the pipeline board.
- **Typography:** A confident display font paired with a highly legible body font,
  readable at arm's length on a phone.
- **Layout:** Card-based pipeline, generous touch targets, minimal nesting.
- **Vibe:** Fast, direct, and zero fluff, but polished enough to feel on-brand
  for a studio that builds eye-catching brand and retail experiences.

## 9. MVP Scope (V1)

**In scope:**
- Better Auth + multi-user (admin + sales roles)
- Deal pipeline kanban with customizable stages and per-stage value totals
- Contacts & companies with aggregated history and duplicate detection
- All four lead-intake channels (manual, web form, email-to-lead, CSV import)
- Activities & unified timeline
- Tasks, follow-ups, reminders, and stale-deal alerts
- Lightweight quotes (status tracking + estimate-viewed alert)
- AI assistant with artifact-based chat UI (Billify pattern): tool use, two-way
  artifact sync, confirmation gating, persisted threads; NL pipeline queries,
  conversational create/edit of deals & quotes, follow-up drafting, lead scoring,
  history summaries, voice-note logging
- Dashboard & reporting (pipeline value, win rate, activity, simple forecast)
- Documents & photos on deals (R2)
- Mobile-responsive, touch-optimised, field-ready capture
- In-app notifications
- CSV import and export

**Deferred to V2+:**
- Full estimate / proposal builder (cost templates, line items, branded layouts)
- Two-way email sync and automatic activity logging at scale
- Project / job tracking and full ops handover (where Buildertrend / JobTread
  play — Blu CRM stays sales-focused)
- Client portal
- E-signature on quotes/contracts
- **Xero integration** — push a Won deal (client + value) to Xero to raise the
  invoice; sync invoice/payment status back onto the deal
- Outlook calendar sync (site visits, deadlines) and two-way email sync
- SharePoint / OneDrive document sync
- SMS / email automation sequences
- Viewer role (tradesmen, subcontractors)
- Email & push notifications
- Offline mode

## 10. Competitor Positioning

| Product | Positioning | What Blu CRM borrows |
|---------|-------------|----------------------|
| **Pipedrive** | Visual deal-pipeline CRM + AI sales assistant | Kanban stages, per-stage value totals, AI deal prioritisation |
| **Followup CRM** | Bid/sales-focused construction CRM | Follow-up scheduling, estimate-viewed alerts, win-rate reporting |
| **JobNimbus** | Trade sales CRM, strong mobile | On-site mobile capture: stage updates and photos from the field |
| **Buildertrend / JobTread** | Full project-management suites (estimating, scheduling, client portal) | **Deliberately out of V1 scope** — marks the V2+ boundary |
| **2026 AI-CRM trend** | NL search, auto-logging, lead scoring, AI drafting | NL pipeline queries, follow-up drafting, lead scoring, summaries |

Blu CRM positions in the **sales-focused tier** (Pipedrive / Followup CRM) rather
than the heavyweight build-management suites: it owns the journey from enquiry to
won, then hands off. Note Blu's work is **commercial creative builds** (fit-outs,
retail, events, exhibitions), not residential home building, so the generic
deal-pipeline model (Pipedrive) fits more naturally than trade-specific suites;
the differentiators Blu cares about are **deadline-driven prioritisation** and an
**AI assistant that already knows how Blu sells**.

## 11. Resolved Decisions

| # | Decision | Answer |
|---|----------|--------|
| 1 | App name | **Blu CRM** |
| 1a | Business | **Blu.Builders Pty Ltd** (ACN 670 602 847), Malaga WA — commercial fit-outs, retail, events, exhibitions, themed builds across Perth/WA |
| 2 | Central object | **Deals / opportunities** — the kanban pipeline is the hub; contacts and activities hang off deals |
| 2a | Pipeline stages | **Blu's existing 8 stages** ship as the default board (Lead Captured → … → Won / Lost-Dormant); customizable |
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

*PRD v0.1 — ready for review and build.*
