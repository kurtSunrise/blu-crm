import { expect, test } from "@playwright/test";

// A real pasted update (a multi-centre quote email) is ~2.2k characters, which
// is longer than the old 2000-char note cap that silently rejected it. Drive
// the full add-a-note flow with a long body and assert it lands in the timeline.
test("a long note saves and appears in the deal timeline", async ({
  page,
}, testInfo) => {
  const companyName = `E2E-note ${testInfo.project.name} ${Date.now()}`;
  // A distinctive sentence we can assert on, padded well past the old cap.
  const marker = `Quote summary across all seven centres ${Date.now()}`;
  const longNote = `${marker}\n\n${"All scope, install labour, delivery and consumables included. ".repeat(40)}`;

  expect(longNote.length).toBeGreaterThan(2000);

  await page.goto("/deals/new");
  await page.getByLabel("Client / brand *").fill(companyName);
  await page.getByLabel("Phone").fill("0400 555 666");
  await page.getByRole("button", { name: "Add lead" }).click();
  await page.waitForURL("**/pipeline");

  // Open the deal page from its card.
  await page.getByRole("link", { name: companyName }).click();
  await page.waitForURL("**/deals/**");

  const noteField = page.getByLabel("Add a note");
  await expect(noteField).toBeVisible();

  // Clicks can race hydration on a fresh nav, so retry until the note lands.
  await expect(async () => {
    await noteField.fill(longNote);
    await page.getByRole("button", { name: "Add note" }).click();
    await expect(page.getByText(marker)).toBeVisible({ timeout: 8000 });
  }).toPass({ timeout: 25_000 });

  // The composer clears on success and shows no error. Scope to the composer's
  // own <p role="alert">, not Next's always-present route announcer div.
  await expect(noteField).toHaveValue("");
  await expect(page.locator('p[role="alert"]')).toHaveCount(0);
});
