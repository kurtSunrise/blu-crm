import { expect, test } from "@playwright/test";
import { queryRows } from "./test-db";

// Matches EMAIL_INTAKE_TOKEN in .env.local (local dev value only).
const LOCAL_INTAKE_TOKEN = "local-dev-intake-token";

test("web enquiry lands in the inbox tagged Web and can be assigned (US-03)", async ({
  page,
}, testInfo) => {
  const stamp = `${testInfo.project.name}-${Date.now()}`;
  const companyName = `Enquiry Co ${stamp}`;

  await page.goto("/enquire");
  await page.getByLabel("Your name *").fill(`Web Lead ${stamp}`);
  await page.getByLabel("Company / brand").fill(companyName);
  await page.getByLabel("Email *").fill(`web-${stamp}@example.com`);
  await page.getByLabel("Project type").selectOption("retail_display");
  await page
    .getByLabel("About the project *")
    .fill("Pop-up retail display for a spring campaign at Karrinyup.");
  await page.getByRole("button", { name: "Send enquiry" }).click();
  await expect(page.getByText("Thanks, we have your enquiry")).toBeVisible();

  // The lead is in the inbox, source-tagged Web, with no owner yet.
  await page.goto("/inbox");
  const lead = page.locator("li").filter({ hasText: companyName }).first();
  await expect(lead).toBeVisible();
  await expect(lead.getByText("Web", { exact: true })).toBeVisible();

  // Assigning an owner clears it from the inbox and notifies the assignee.
  await lead.getByRole("combobox").selectOption({ label: "Jessica Rodin" });
  await expect(page.locator("li").filter({ hasText: companyName })).toHaveCount(
    0
  );

  // The notification targets the assignee (Jess), so it must NOT appear in
  // Kurt's now per-user feed; assert the row landed for her server-side.
  await expect(async () => {
    const rows = await queryRows<{ email: string }>(
      `select u.email from "notification" n
       join "user" u on u.id = n.user_id
       where n.type = 'lead_assigned' and n.payload->>'dealTitle' like $1`,
      [`%${companyName}%`]
    );
    expect(rows.map((row) => row.email)).toContain("jess@blu.builders");
  }).toPass({ timeout: 15_000 });

  await page.goto("/notifications");
  await expect(
    page
      .locator("li")
      .filter({ hasText: "New lead assigned to you" })
      .filter({ hasText: companyName })
  ).toHaveCount(0);
});

test("the enquiry honeypot swallows bot submissions silently", async ({
  page,
}, testInfo) => {
  const stamp = `${testInfo.project.name}-${Date.now()}`;
  const companyName = `Bot Co ${stamp}`;

  await page.goto("/enquire");
  await page.getByLabel("Your name *").fill("Bot");
  await page.getByLabel("Company / brand").fill(companyName);
  await page.getByLabel("Email *").fill(`bot-${stamp}@example.com`);
  await page.getByLabel("About the project *").fill("spam");
  // Bots fill every field, including the visually hidden one.
  await page
    .locator('input[name="website"]')
    .evaluate((element: HTMLInputElement) => {
      element.value = "https://spam.example.com";
    });
  await page.getByRole("button", { name: "Send enquiry" }).click();

  // Looks successful to the bot, but nothing was stored.
  await expect(page.getByText("Thanks, we have your enquiry")).toBeVisible();
  await page.goto("/inbox");
  await expect(page.getByRole("heading", { name: "Inbox" })).toBeVisible();
  await expect(page.locator("li").filter({ hasText: companyName })).toHaveCount(
    0
  );
});

test("the public enquiry endpoint is write-only", async ({ request }) => {
  const read = await request.get("/api/enquiries");
  expect(read.status()).toBe(405);
});

test("a forwarded email becomes a raw lead in the inbox (US-01)", async ({
  page,
  request,
}, testInfo) => {
  const stamp = `${testInfo.project.name}-${Date.now()}`;
  const subject = `Christmas activation enquiry ${stamp}`;

  const unauthorised = await request.post("/api/intake/email", {
    data: { from: "client@example.com", subject },
  });
  expect(unauthorised.status()).toBe(401);

  const response = await request.post("/api/intake/email", {
    headers: { Authorization: `Bearer ${LOCAL_INTAKE_TOKEN}` },
    data: {
      from: `enquiry-${stamp}@brand.example.com`,
      fromName: `Brand Manager ${stamp}`,
      subject,
      body: `Hi Blu team,\n\nWe need a Christmas activation across two centres. Reference ${stamp}.`,
    },
  });
  expect(response.status()).toBe(201);

  // The raw lead is triageable from the inbox with the body attached.
  await page.goto("/inbox");
  const lead = page.locator("li").filter({ hasText: subject }).first();
  await expect(lead).toBeVisible();
  await lead.getByRole("link").first().click();

  await expect(
    page
      .locator('section[aria-label="Timeline"]')
      .getByText(`Reference ${stamp}`)
  ).toBeVisible();
});

test("a discarded inbox lead disappears from inbox and pipeline", async ({
  page,
  request,
}, testInfo) => {
  const stamp = `${testInfo.project.name}-${Date.now()}`;
  const subject = `Discard me ${stamp}`;

  const response = await request.post("/api/intake/email", {
    headers: { Authorization: `Bearer ${LOCAL_INTAKE_TOKEN}` },
    data: { from: `discard-${stamp}@example.com`, subject },
  });
  expect(response.status()).toBe(201);

  await page.goto("/inbox");
  const lead = page.locator("li").filter({ hasText: subject }).first();
  await expect(lead).toBeVisible();
  await lead.getByRole("button", { name: `Discard me ${stamp}` }).click();
  await expect(page.locator("li").filter({ hasText: subject })).toHaveCount(0);

  await page.goto("/pipeline");
  await expect(
    page.getByRole("heading", { name: "Pipeline", exact: true })
  ).toBeVisible();
  await expect(page.getByText(subject)).toHaveCount(0);
});
