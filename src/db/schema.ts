import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
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
]);

export const quoteStatus = pgEnum("quote_status", [
  "draft",
  "sent",
  "viewed",
  "accepted",
  "declined",
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
  // When the deal entered a Won or Lost / Dormant stage; cleared if reopened.
  // Drives "won/lost this week" in reporting (FR-8.2).
  closedAt: timestamp("closed_at", { withTimezone: true }),
  handoverToDelivery: boolean("handover_to_delivery").notNull().default(false),
  notes: text("notes"),
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

export const notification = pgTable("notification", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .references(() => user.id),
  type: text("type").notNull(),
  payload: jsonb("payload"),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

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
  // { toolUseId, toolName, input, heldToolResults? } while a write awaits
  // user confirmation; cleared once resolved (FR-7.8)
  pendingToolUse: jsonb("pending_tool_use"),
  lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
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

export const knowledgeChunk = pgTable("knowledge_chunk", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  docId: text("doc_id")
    .notNull()
    .references(() => knowledgeDoc.id, { onDelete: "cascade" }),
  heading: text("heading"),
  content: text("content").notNull(),
  position: integer("position").notNull(),
});

// Named aggregate so consumers avoid namespace imports (Ultracite rule)
export const schema = {
  account,
  activity,
  aiAuditLog,
  appSetting,
  attachment,
  chatMessage,
  chatThread,
  company,
  contact,
  deal,
  followUp,
  knowledgeChunk,
  knowledgeDoc,
  notification,
  pipelineStage,
  quote,
  session,
  user,
  verification,
};
