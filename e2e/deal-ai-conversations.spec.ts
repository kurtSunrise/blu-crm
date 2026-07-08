import { expect, test } from "@playwright/test";

// The deal page carries an "AI conversations" card so the team can reopen (or
// start) an assistant chat scoped to the deal. A brand-new deal has none, so it
// shows the empty state; the "New chat" action opens the assistant dock.
test("a deal shows the AI conversations card and can start a new chat", async ({
  page,
}, testInfo) => {
  const companyName = `E2E-ai ${testInfo.project.name} ${Date.now()}`;

  await page.goto("/deals/new");
  await page.getByLabel("Client / brand *").fill(companyName);
  await page.getByLabel("Phone").fill("0400 555 777");
  await page.getByRole("button", { name: "Add lead" }).click();
  await page.waitForURL("**/pipeline");

  await page.getByRole("link", { name: companyName }).click();
  await page.waitForURL("**/deals/**");

  const section = page.getByRole("region", { name: "AI conversations" });
  await expect(section).toBeVisible();
  await expect(section.getByText("No conversations yet.")).toBeVisible();

  // "New chat" opens the assistant dock (client-only; the mounted deal beacon
  // scopes the first message). The dock's composer appearing proves the wiring.
  await section.getByRole("button", { name: "New chat" }).click();
  await expect(
    page.getByRole("textbox", { name: "Message the assistant" })
  ).toBeVisible();
});
