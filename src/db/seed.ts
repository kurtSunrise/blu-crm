import { hashPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import { db } from "./index";
import { account, pipelineStage, user } from "./schema";

// Blu's eight default stages (FR-1.2); weightings are first-pass defaults,
// admin-editable per FR-8.1 and open question Q2.
const DEFAULT_STAGES = [
  { name: "Lead Captured", position: 1, weighting: 5 },
  { name: "Qualified", position: 2, weighting: 15 },
  { name: "Brief / Site Visit", position: 3, weighting: 25 },
  { name: "Concept / Quote Issued", position: 4, weighting: 40 },
  { name: "Proposal Review", position: 5, weighting: 55 },
  { name: "Negotiation", position: 6, weighting: 70 },
  { name: "Won", position: 7, weighting: 100, isWon: true },
  { name: "Lost / Dormant", position: 8, weighting: 0, isLost: true },
];

// The three core users (PRD §4.2). Auth credentials/SSO are wired later;
// these rows let deals carry an owner from day one.
const TEAM_USERS = [
  {
    id: "andy",
    name: "Andy Watson",
    email: "andy@blu.builders",
    role: "admin",
  },
  { id: "kurt", name: "Kurt Weiss", email: "kurt@blu.builders", role: "admin" },
  {
    id: "jess",
    name: "Jessica Rodin",
    email: "jess@blu.builders",
    role: "sales",
  },
];

const seed = async () => {
  const existingStages = await db.select().from(pipelineStage).limit(1);

  if (existingStages.length === 0) {
    await db.insert(pipelineStage).values(DEFAULT_STAGES);
    process.stdout.write("Seeded 8 default pipeline stages.\n");
  } else {
    process.stdout.write("Pipeline stages already seeded, skipping.\n");
  }

  const existingUsers = await db.select().from(user).limit(1);

  if (existingUsers.length === 0) {
    await db.insert(user).values(TEAM_USERS);
    process.stdout.write("Seeded 3 team users (Andy, Kurt, Jess).\n");
  } else {
    process.stdout.write("Users already seeded, skipping.\n");
  }

  // Attach Better Auth credential accounts so the team can sign in.
  // SEED_USER_PASSWORD sets the initial password (local default is for
  // dev/E2E only; use a real value when seeding production).
  const password = process.env.SEED_USER_PASSWORD ?? "blu-crm-dev";
  const passwordHash = await hashPassword(password);

  for (const member of TEAM_USERS) {
    const [existing] = await db
      .select({ id: account.id })
      .from(account)
      .where(eq(account.userId, member.id))
      .limit(1);
    if (existing) {
      continue;
    }
    await db.insert(account).values({
      id: crypto.randomUUID(),
      accountId: member.id,
      providerId: "credential",
      userId: member.id,
      password: passwordHash,
    });
    process.stdout.write(`Attached credentials for ${member.email}.\n`);
  }
};

const main = async () => {
  try {
    await seed();
  } catch (error) {
    process.stderr.write(`Seed failed: ${String(error)}\n`);
    process.exitCode = 1;
  }
};

main();
