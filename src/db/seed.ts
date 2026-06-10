import { db } from "./index";
import { pipelineStage } from "./schema";

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

const seed = async () => {
  const existing = await db.select().from(pipelineStage).limit(1);

  if (existing.length > 0) {
    process.stdout.write("Pipeline stages already seeded, skipping.\n");
    return;
  }

  await db.insert(pipelineStage).values(DEFAULT_STAGES);
  process.stdout.write("Seeded 8 default pipeline stages.\n");
};

await seed();
