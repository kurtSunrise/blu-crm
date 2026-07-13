# Blu CRM Competitive Gap Analysis and Best-in-Class Roadmap

**Date:** 13/07/2026
**Prepared by:** Claude (Fable 5), requested by Kurt
**Inputs:** PRD.md, Team Constitution, full shipped-feature inventory (work logs, routes, 23 assistant tools, report pages), and web research on Pipedrive Pulse, Attio, HubSpot Breeze, Salesforce Agentforce, construction CRMs (Followup CRM, JobNimbus), and Palantir Foundry/AIP.

Standing constraints honoured throughout: NO AI email sending, NO thread sharing, no prod data deletion, single-org three-user team, low running cost.

---

## Where Blu CRM is already ahead of the pack

Worth stating so we don't chase parity we already have. For a 3-seat tool, these are genuinely differentiated:

- **Confirmation-gated multi-write AI plans** with per-item approve/skip/edit and a full audit trail. Salesforce sells this as "trust layer governance"; Blu already has it.
- **Semantic search over uploaded deal documents** (Word/Excel/PPT/PDF) fused with knowledge RAG and native citations. Attio and Pipedrive have nothing equivalent at the document level.
- **Proactive scheduled AI** (Monday weekly report, Tue-Fri morning briefing, stale-deal nudges delivered into assistant threads). This is the "agentic" direction HubSpot and Salesforce are marketing, already shipped.
- Voice capture, deadline-driven prioritisation, cross-thread memory, and on-brand drafting from a curated knowledge base.

---

## Gap analysis by competitor lens

### 1. Pipedrive (Pulse): engagement signals are the missing data feed

Pulse scores leads on real buyer behaviour: email opens, replies, interaction recency. Blu's `rank_open_deals` is a heuristic over value, deadline, and staleness; it has no engagement data because the only inbound signal today is the quote-viewed event. The CRM never sees the email thread itself.

**Gap G1: two-way Microsoft 365 email sync.** Auto-log inbound and outbound mail on the matching deal/contact (Graph API subscription on info@ plus each user's mailbox). This is different from AI *sending* email (vetoed); it is passive logging. It attacks the single biggest source of manual data entry and unlocks engagement-aware scoring, accurate "last contact", and stale-deal detection that doesn't depend on someone remembering to log a call. Every competitor treats this as table stakes. Already listed as V2 in the PRD.

### 2. Attio: enrichment and AI in the data model

Attio auto-fills attributes with AI (web research agent, ICP-fit classification) and positions the CRM as a context layer other tools can reach (MCP).

**Gap G2: company/contact enrichment.** For an Australian commercial builder this is cheap and concrete: the free ABN Lookup API for company legals, plus an assistant web-research pass to fill industry, size, website, and venue details when a company is created.

**Gap G3: AI-computed fields.** Let the assistant maintain derived attributes per deal (fit/quality tier against Blu's qualification rubric, risk flags) rather than only answering when asked.

**Gap G4: CRM as context layer (MCP server).** Expose the read tools (already built and typed) via a small authenticated MCP endpoint so the team can query the pipeline from Claude or other clients. Low effort because the tool layer already exists.

### 3. HubSpot Breeze: the data-hygiene agent

Breeze's Data Agent continuously monitors for duplicates, gaps, and stale fields. Blu has duplicate detection at creation time only.

**Gap G5: scheduled data-hygiene sweep.** A cron-driven assistant job (same infra as the morning briefing) that surfaces dupes, deals missing fixed dates/values/decision-maker, contacts without companies, and quotes stuck in Sent, delivered as a briefing card with one-tap fixes through the existing confirmation flow.

### 4. Salesforce Agentforce: graduated autonomy

The 2026 direction is "AI that acts" under governance. Blu gates every write, which is correct as a default but all-or-nothing.

**Gap G6: per-tool autonomy settings.** Admin-configurable auto-approve for low-risk routine writes (log_activity, complete_follow_up, triage discard) with the existing audit log and an undo window; high-risk writes (stage moves, quotes, Won/Lost) stay gated. Moves from augmentation toward automation without abandoning the confirmation principle.

### 5. Construction CRMs (Followup CRM, JobNimbus): workflow automation and client-facing quotes

JobNimbus fires emails/tasks/SMS automatically on stage change; Followup CRM is built around never letting a bid go quiet.

**Gap G7: lightweight automation rules.** Admin-defined triggers: "on stage change to Concept/Quote Issued, create a follow-up due in 3 days"; "quote Sent and not Viewed in 5 days, nudge the owner". A deterministic rules engine (not AI) on the existing notification and task plumbing.

**Gap G8: quote acceptance and e-signature on the tokenised quote page.** `q/[token]` already exists; add Accept/Decline buttons, a typed-name e-sign record, and later a deposit-payment link. A 2026 SMB expectation that directly shortens Blu's close loop. The full proposal *builder* stays V2 as the PRD says.

### 6. Palantir (Foundry/AIP): ontology, kinetics, and the learning loop

Palantir's differentiator is modelling *decisions*, not data: semantic objects (nouns) paired with governed actions (verbs) and feedback loops that move workflows from augmentation to automation. Blu already has a miniature version of this: typed entities, tool-mediated writes as the only AI mutation path, and a full audit log. What's missing is closing the loop:

**Gap G9: outcome learning loop.** Won/Lost outcomes, lost reasons, quote response times, and stage-conversion history exist in the database but feed nothing. Use them to:
- (a) ground `rank_open_deals` and stage weightings in Blu's actual conversion rates instead of admin-guessed defaults (PRD open question Q2),
- (b) give the assistant win/loss pattern context when qualifying ("jobs like this with no confirmed decision-maker close at X%"),
- (c) auto-suggest weighting updates quarterly.

**Gap G10: the metrics page.** PRD section 13 promised an admin page rendering success metrics M1-M9 from the event log. It never shipped. Best-in-class products measure themselves; this also proves adoption to Andy.

### Known deferred items that remain real gaps (PRD V2 list, unchanged)

Outlook calendar sync (G11), Xero Won-deal handoff (G12), SMS channel, client portal, offline/PWA mode, viewer role, email and push notification delivery. Correctly sequenced behind the items above.

---

## Recommended roadmap (priority order)

### Tier 1: close the data loop (biggest best-in-class delta)
1. **G1 Email sync** (M365 Graph, read-only logging). The highest-impact gap in the whole analysis; feeds G5, G9, and scoring.
2. **G9 Outcome learning loop.** Palantir-style feedback into scoring and forecast weightings; mostly SQL over data already collected.
3. **G7 Automation rules.** Deterministic stage/quote/staleness triggers on existing plumbing.
4. **G5 Data-hygiene sweep.** New cron job on the existing briefing infrastructure.

### Tier 2: close the client loop
5. **G8 Quote accept/decline + e-sign** on `q/[token]`, deposit link later.
6. **G2 Enrichment** (ABN Lookup + web research on company create).
7. **G6 Graduated autonomy settings** for low-risk assistant writes.
8. **G11 Outlook calendar sync** (site visits, fixed dates).

### Tier 3: platform maturity
9. **G10 Metrics page (M1-M9)**, **G4 MCP context layer**, **G3 AI-computed deal fields**, then G12 Xero and the remaining V2 list.

---

## Constraint check

Each roadmap item was checked against standing rules: no AI email sending (G1 is receive/log only), no thread sharing (G4 exposes typed tools, not threads), no prod deletion (G5 surfaces issues; humans act on them).

## Key sources

- Pipedrive Pulse: https://www.pipedrive.com/en/blog/pipedrive-pulse and https://support.pipedrive.com/en/article/pulse
- Attio AI 2026: https://crmnewspaper.com/blog/attio-ai-updates-ask-attio-2026/ and https://attio.com/platform/ai
- HubSpot Breeze agents: https://www.hubspot.com/products/artificial-intelligence/breeze-ai-agents and https://www.onthefuze.com/hubspot-insights-blog/hubspot-breeze-ai-agents-2026
- Salesforce Agentforce direction: https://www.salesforce.com/blog/ai-agent-trends-2026/
- Palantir ontology (semantic + kinetic, decisions not data): https://www.palantir.com/docs/foundry/ontology/overview and https://www.palantir.com/docs/foundry/architecture-center/ontology-system
- Construction CRM field: https://myquoteiq.com/top-10-crms-with-automated-follow-up-for-contractors-in-2026/ and https://constructionbids.ai/blog/best-construction-crm-software-guide
