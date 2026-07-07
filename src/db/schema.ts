import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  vector,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Better Auth tables (kept aligned with the Better Auth Drizzle adapter)
// ---------------------------------------------------------------------------

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  role: text("role").notNull().default("sales"),
  // Soft-disable: a disabled member cannot sign in and any live session is
  // treated as signed out. We never hard-delete users because deal/created_by/
  // uploaded_by FKs lack cascade (PRD §7: no hard deletes).
  disabled: boolean("disabled").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  token: text("token").notNull().unique(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", {
    withTimezone: true,
  }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
    withTimezone: true,
  }),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Better Auth's rate-limit counters (sign-in throttling). Database storage is
// required on Workers: in-memory counters are per-isolate and effectively
// useless there. lastRequest is a millisecond epoch, hence bigint.
export const rateLimit = pgTable("rate_limit", {
  id: text("id").primaryKey(),
  key: text("key"),
  count: integer("count"),
  lastRequest: bigint("last_request", { mode: "number" }),
});

// ---------------------------------------------------------------------------
// CRM enums (PRD §7 / FR-1.5)
// ---------------------------------------------------------------------------

export const leadSource = pgEnum("lead_source", [
  "web",
  "instagram",
  "referral",
  "repeat_client",
  "other",
]);

export const projectType = pgEnum("project_type", [
  "fit_out",
  "retail_display",
  "event_stand",
  "exhibition",
  "install",
  "themed_build",
  "other",
]);

export const fixedDateType = pgEnum("fixed_date_type", [
  "install",
  "event",
  "launch",
]);

export const lostReason = pgEnum("lost_reason", [
  "price",
  "timing",
  "went_elsewhere",
  "no_response",
  "parked",
]);

export const activityType = pgEnum("activity_type", [
  "call",
  "email",
  "site_visit",
  "meeting",
  "note",
  "stage_change",
  "quote_event",
  "follow_up",
]);

export const quoteStatus = pgEnum("quote_status", [
  "draft",
  "sent",
  "viewed",
  "accepted",
  "declined",
]);

export const stageEventSource = pgEnum("stage_event_source", [
  "create",
  "move",
  "stage_delete",
  "backfill",
]);

// ---------------------------------------------------------------------------
// CRM tables — money in AUD integer cents, timestamps UTC (displayed AWST),
// soft-delete via deleted_at on deals/contacts/companies (PRD §7 conventions)
// ---------------------------------------------------------------------------

export const pipelineStage = pgTable("pipeline_stage", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  position: integer("position").notNull(),
  // Forecast weighting as a percentage (0–100), admin-editable (FR-8.1)
  weighting: integer("weighting").notNull().default(0),
  isWon: boolean("is_won").notNull().default(false),
  isLost: boolean("is_lost").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Stage-independent labels for deals stalled on an external dependency, applied
// on top of the pipeline stage so a blocked deal can be flagged without moving
// it out of its stage. Admin-configurable (label, colour, order), the same
// data-driven pattern as pipeline_stage. `color` holds a palette key resolved
// to Tailwind classes in src/lib/labels.ts; removing a status soft-archives it
// (archivedAt) so deals that still reference it keep their badge.
export const dealSubStatus = pgTable("deal_sub_status", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  label: text("label").notNull(),
  color: text("color").notNull(),
  position: integer("position").notNull(),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const company = pgTable("company", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  // brand / agency / venue / shopping centre / referral partner
  kind: text("kind"),
  website: text("website"),
  notes: text("notes"),
  createdBy: text("created_by").references(() => user.id),
  updatedBy: text("updated_by").references(() => user.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const contact = pgTable("contact", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  title: text("title"),
  companyId: text("company_id").references(() => company.id),
  notes: text("notes"),
  createdBy: text("created_by").references(() => user.id),
  updatedBy: text("updated_by").references(() => user.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const deal = pgTable("deal", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  // BLU-[YYYY]-[###], unique and immutable (FR-1.5)
  leadId: text("lead_id").notNull().unique(),
  title: text("title").notNull(),
  estimatedValueCents: integer("estimated_value_cents"),
  estimatedValueMaxCents: integer("estimated_value_max_cents"),
  quotedValueCents: integer("quoted_value_cents"),
  stageId: text("stage_id")
    .notNull()
    .references(() => pipelineStage.id),
  ownerId: text("owner_id").references(() => user.id),
  source: leadSource("source").notNull().default("other"),
  companyId: text("company_id").references(() => company.id),
  contactId: text("contact_id").references(() => contact.id),
  projectType: projectType("project_type"),
  venue: text("venue"),
  scopeSummary: text("scope_summary"),
  fixedDate: timestamp("fixed_date", { withTimezone: true }),
  fixedDateType: fixedDateType("fixed_date_type"),
  decisionMakerConfirmed: boolean("decision_maker_confirmed")
    .notNull()
    .default(false),
  expectedCloseDate: timestamp("expected_close_date", { withTimezone: true }),
  lostReason: lostReason("lost_reason"),
  // Optional on-hold / blocked label, applied independently of the stage.
  // null means the deal is progressing normally. FK to the admin-configurable
  // deal_sub_status table.
  subStatusId: text("sub_status_id").references(() => dealSubStatus.id),
  subStatusNote: text("sub_status_note"),
  // Stamped when the label is applied or changed; cleared with the label. Lets
  // surfaces show "on hold since" and supports future stale-hold reporting.
  subStatusSetAt: timestamp("sub_status_set_at", { withTimezone: true }),
  // When the deal entered a Won or Lost / Dormant stage; cleared if reopened.
  // Drives "won/lost this week" in reporting (FR-8.2).
  closedAt: timestamp("closed_at", { withTimezone: true }),
  handoverToDelivery: boolean("handover_to_delivery").notNull().default(false),
  notes: text("notes"),
  // OneDrive / shared-folder link for the deal's files. Interim until the
  // Microsoft 365 integration lands; surfaced on the deal page and to the AI.
  sharedFolderUrl: text("shared_folder_url"),
  lastContactAt: timestamp("last_contact_at", { withTimezone: true }),
  createdBy: text("created_by").references(() => user.id),
  updatedBy: text("updated_by").references(() => user.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const activity = pgTable("activity", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  dealId: text("deal_id")
    .notNull()
    .references(() => deal.id),
  contactId: text("contact_id").references(() => contact.id),
  type: activityType("type").notNull(),
  content: text("content"),
  createdBy: text("created_by").references(() => user.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Structured history of every pipeline-stage transition, one row per move
// including the initial placement at creation. Powers funnel conversion and
// time-in-stage reporting, which the free-text stage_change activities cannot.
// Stage ids are soft references (no FK) because deleteStage hard-deletes
// pipeline_stage rows; the name snapshots are the durable record and the ids
// resolve only while the stage still exists.
export const dealStageEvent = pgTable(
  "deal_stage_event",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    dealId: text("deal_id")
      .notNull()
      .references(() => deal.id),
    fromStageId: text("from_stage_id"),
    toStageId: text("to_stage_id"),
    fromStageName: text("from_stage_name"),
    toStageName: text("to_stage_name").notNull(),
    // The stage_change activity row this event mirrors. Uniqueness keys the
    // backfill script's ON CONFLICT so it can never duplicate a live write.
    activityId: text("activity_id")
      .references(() => activity.id)
      .unique(),
    source: stageEventSource("source").notNull(),
    changedBy: text("changed_by").references(() => user.id),
    changedAt: timestamp("changed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("deal_stage_event_deal_idx").on(table.dealId, table.changedAt),
    index("deal_stage_event_changed_at_idx").on(table.changedAt),
    index("deal_stage_event_to_stage_idx").on(table.toStageId),
  ]
);

export const followUp = pgTable("follow_up", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  dealId: text("deal_id")
    .notNull()
    .references(() => deal.id),
  action: text("action").notNull(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => user.id),
  dueDate: timestamp("due_date", { withTimezone: true }).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdBy: text("created_by").references(() => user.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const quote = pgTable("quote", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  dealId: text("deal_id")
    .notNull()
    .references(() => deal.id),
  fileKey: text("file_key"),
  valueCents: integer("value_cents"),
  status: quoteStatus("status").notNull().default("draft"),
  // Tokenised per recipient; exposes only the quote, never the CRM (FR-6.2)
  viewToken: text("view_token").unique(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  viewedAt: timestamp("viewed_at", { withTimezone: true }),
  // When the client decided: stamped on the accepted/declined transition.
  // Drives time-to-accept in the quote analytics (Reports, Team).
  respondedAt: timestamp("responded_at", { withTimezone: true }),
  createdBy: text("created_by").references(() => user.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const attachment = pgTable("attachment", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  dealId: text("deal_id")
    .notNull()
    .references(() => deal.id),
  fileKey: text("file_key").notNull(),
  fileName: text("file_name").notNull(),
  contentType: text("content_type"),
  sizeBytes: integer("size_bytes"),
  uploadedBy: text("uploaded_by").references(() => user.id),
  // Cached AI vision description, generated lazily the first time the
  // assistant views the file, so later turns reference it cheaply (no image
  // tokens or Worker CPU re-spent). Null until first viewed.
  aiDescription: text("ai_description"),
  aiDescribedAt: timestamp("ai_described_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Admin-configurable settings (FR-5.3 AC: stale/closing-soon thresholds)
export const appSetting = pgTable("app_setting", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const notification = pgTable(
  "notification",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    type: text("type").notNull(),
    payload: jsonb("payload"),
    // Insert-time idempotency for sweep-generated notifications
    // ("{type}:{subjectId}:{recipientId}"). Null for one-shot events;
    // Postgres allows unlimited nulls under the unique index.
    dedupeKey: text("dedupe_key"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("notification_user_created_idx").on(table.userId, table.createdAt),
    // Partial index: the polled unread badge count is the hottest query.
    index("notification_user_unread_idx")
      .on(table.userId)
      .where(sql`${table.readAt} is null`),
    uniqueIndex("notification_dedupe_key_idx").on(table.dedupeKey),
  ]
);

// Per-user event-type toggles. Absence of a row means enabled, so new event
// types default on for everyone without a backfill.
export const notificationPreference = pgTable(
  "notification_preference",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    type: text("type").notNull(),
    enabled: boolean("enabled").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.type] })]
);

// ---------------------------------------------------------------------------
// AI assistant (M4 / FR-7) — persisted chat threads, replayable messages, and
// an audit trail for every AI-proposed mutation (PRD §9.3 auditability)
// ---------------------------------------------------------------------------

export const chatThreadStatus = pgEnum("chat_thread_status", [
  "idle",
  "awaiting_confirmation",
]);

export const chatMessageRole = pgEnum("chat_message_role", [
  "user",
  "assistant",
]);

export const aiAuditStatus = pgEnum("ai_audit_status", [
  "proposed",
  "confirmed",
  "denied",
  "executed",
  "failed",
  // A later plan item never attempted because an earlier one failed
  // (multi-step write plans execute in order, stop on first failure)
  "skipped",
]);

export const chatThread = pgTable("chat_thread", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  title: text("title"),
  originPage: text("origin_page"),
  dealId: text("deal_id").references(() => deal.id),
  contactId: text("contact_id").references(() => contact.id),
  status: chatThreadStatus("status").notNull().default("idle"),
  // PendingPlan jsonb ({ version: 2, items[], heldToolResults }) while gated
  // writes await user confirmation; legacy single-item shape still parses.
  // Cleared once resolved (FR-7.8).
  pendingToolUse: jsonb("pending_tool_use"),
  lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  // Pinned threads sort first in history; null = unpinned
  pinnedAt: timestamp("pinned_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const chatMessage = pgTable("chat_message", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  threadId: text("thread_id")
    .notNull()
    .references(() => chatThread.id, { onDelete: "cascade" }),
  role: chatMessageRole("role").notNull(),
  // Full Anthropic content-block array (text / tool_use / tool_result) so the
  // agent loop can replay history verbatim, incl. across confirm round-trips
  content: jsonb("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Files the user attaches to the assistant (images, PDFs) for context. Bytes
// live in the private R2 bucket; the chat message stores only a reference and
// the model-facing request rehydrates base64 at send time. threadId is
// nullable so a file can be uploaded before the first message creates the
// thread, then linked once it exists.
export const chatAttachment = pgTable("chat_attachment", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  threadId: text("thread_id").references(() => chatThread.id, {
    onDelete: "cascade",
  }),
  fileKey: text("file_key").notNull(),
  fileName: text("file_name").notNull(),
  contentType: text("content_type").notNull(),
  sizeBytes: integer("size_bytes"),
  uploadedBy: text("uploaded_by").references(() => user.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const aiAuditLog = pgTable("ai_audit_log", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  threadId: text("thread_id")
    .notNull()
    .references(() => chatThread.id),
  toolUseId: text("tool_use_id").notNull(),
  toolName: text("tool_name").notNull(),
  // The chat_message the proposal belongs to; anchors resumed confirmation
  // cards at the right transcript position. Null on rows predating this
  // column (those threads simply stay text-only, no backfill).
  messageId: text("message_id"),
  // Input as proposed by the model; finalInput captures user edits at confirm
  input: jsonb("input").notNull(),
  finalInput: jsonb("final_input"),
  status: aiAuditStatus("status").notNull().default("proposed"),
  result: jsonb("result"),
  error: text("error"),
  userId: text("user_id").references(() => user.id),
  confirmedBy: text("confirmed_by").references(() => user.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});

// Artifact data-parts (deal cards, deal lists, drafts) persisted per assistant
// message so resumed threads re-render their cards. Kept OUT of
// chat_message.content: replay must stay a byte-pure Anthropic block array,
// and artifacts are never model-visible.
export const chatArtifact = pgTable(
  "chat_artifact",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    threadId: text("thread_id")
      .notNull()
      .references(() => chatThread.id, { onDelete: "cascade" }),
    // Cascade so regenerate's message rollback cleans up cards with it
    messageId: text("message_id")
      .notNull()
      .references(() => chatMessage.id, { onDelete: "cascade" }),
    // Emission order within the message
    position: integer("position").notNull(),
    // Matches ArtifactType at write time; text (not enum) so types can evolve
    artifactType: text("artifact_type").notNull(),
    data: jsonb("data").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("chat_artifact_thread_idx").on(table.threadId)]
);

export const chatFeedbackRating = pgEnum("chat_feedback_rating", [
  "up",
  "down",
]);

// Per-message thumbs feedback on assistant replies (Assistant v3 Phase 1).
// One row per (message, user); a downvote may carry a category and comment.
// "Clearing" feedback deletes the row rather than storing a third state, so
// the table only ever holds live ratings.
export const chatFeedback = pgTable(
  "chat_feedback",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    messageId: text("message_id")
      .notNull()
      .references(() => chatMessage.id, { onDelete: "cascade" }),
    threadId: text("thread_id")
      .notNull()
      .references(() => chatThread.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    rating: chatFeedbackRating("rating").notNull(),
    // Downvote reason ("inaccurate" | "not_relevant" | "incomplete"); text,
    // not an enum, so reasons can evolve without a migration.
    category: text("category"),
    comment: text("comment"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Upsert target: one rating per user per message.
    uniqueIndex("chat_feedback_message_user_idx").on(
      table.messageId,
      table.userId
    ),
    // Thread-resume GET loads all of one user's ratings for a thread.
    index("chat_feedback_thread_idx").on(table.threadId, table.userId),
  ]
);

// Cross-thread assistant memory (Assistant v3 Phase 3): durable facts and
// preferences the assistant saves automatically via the save_memory tool and
// injects into future conversations. userId NULL means the memory is
// org-wide (visible to every user's assistant); a non-null userId scopes it
// to that person. Soft delete via disabledAt so the review UI in Settings
// and the in-chat Undo chip never hard-delete history.
export const assistantMemory = pgTable(
  "assistant_memory",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    // The chat thread the memory was saved from, for provenance in the
    // review UI. Detached (not deleted) if the thread goes away.
    sourceThreadId: text("source_thread_id").references(() => chatThread.id, {
      onDelete: "set null",
    }),
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Every read path filters by scope + active: own rows, org rows (NULL
    // user_id lands in the index too), disabled_at IS NULL.
    index("assistant_memory_user_idx").on(table.userId, table.disabledAt),
  ]
);

// ---------------------------------------------------------------------------
// Knowledge base — a small corpus of company "how we work" docs (brand voice,
// sales process, quoting/pricing rules). The assistant searches it via the
// search_knowledge_base tool. Retrieval is Postgres full-text search; chunks
// hold the searchable passages so results stay small and precise.
// ---------------------------------------------------------------------------

export const knowledgeDoc = pgTable("knowledge_doc", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  // Stable human key; the import upserts by slug so re-runs replace cleanly.
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  category: text("category"),
  content: text("content").notNull(),
  source: text("source"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const knowledgeChunk = pgTable(
  "knowledge_chunk",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    docId: text("doc_id")
      .notNull()
      .references(() => knowledgeDoc.id, { onDelete: "cascade" }),
    heading: text("heading"),
    content: text("content").notNull(),
    position: integer("position").notNull(),
    // @cf/baai/bge-m3 embedding (Workers AI). Nullable: rows imported without
    // Cloudflare credentials fall back to pure full-text search. Requires the
    // pgvector extension (npm run db:pgvector) BEFORE db:push.
    embedding: vector("embedding", { dimensions: 1024 }),
  },
  (table) => [
    // HNSW over IVFFlat: builds on an empty table and needs no list tuning,
    // right for a corpus this small.
    index("knowledge_chunk_embedding_idx").using(
      "hnsw",
      table.embedding.op("vector_cosine_ops")
    ),
  ]
);

// Named aggregate so consumers avoid namespace imports (Ultracite rule)
export const schema = {
  account,
  activity,
  aiAuditLog,
  appSetting,
  assistantMemory,
  attachment,
  chatArtifact,
  chatFeedback,
  chatMessage,
  chatThread,
  company,
  contact,
  deal,
  dealStageEvent,
  dealSubStatus,
  followUp,
  knowledgeChunk,
  knowledgeDoc,
  notification,
  notificationPreference,
  pipelineStage,
  quote,
  session,
  user,
  verification,
};
