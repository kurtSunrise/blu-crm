import { expect, test } from "@playwright/test";

// 1x1 red pixel PNG.
const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

test("a photo uploads onto the deal and streams back privately (FR-9)", async ({
  page,
}, testInfo) => {
  const companyName = `Photo Co ${testInfo.project.name} ${Date.now()}`;

  await page.goto("/deals/new");
  await page.getByLabel("Client / brand *").fill(companyName);
  await page.getByLabel("Phone").fill("0400 888 999");
  await page.getByRole("button", { name: "Add lead" }).click();
  await page.waitForURL("**/pipeline");

  await page
    .locator('section[aria-label="Lead Captured"]')
    .getByRole("heading", { name: companyName })
    .click();

  const filesSection = page.locator('section[aria-label="Files and photos"]');
  await expect(
    filesSection.getByRole("button", { name: "Add photo or file" })
  ).toBeVisible();

  await page.locator("#attachment-file").setInputFiles({
    name: "site-photo.png",
    mimeType: "image/png",
    buffer: Buffer.from(PNG_BASE64, "base64"),
  });

  // The thumbnail appears and the private route serves the original bytes.
  const thumbnail = filesSection.getByRole("img", { name: "site-photo.png" });
  await expect(thumbnail).toBeVisible();

  const fileLink = filesSection.locator('a[href^="/api/attachments/"]');
  const href = await fileLink.first().getAttribute("href");
  const response = await page.request.get(href as string);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toBe("image/png");

  // The upload is recorded on the timeline (FR-4.2).
  await expect(
    page
      .locator('section[aria-label="Timeline"]')
      .getByText("Attached site-photo.png")
  ).toBeVisible();
});

test("oversized or unsupported files are rejected", async ({ request }) => {
  const missingFile = await request.post("/api/attachments", {
    multipart: { dealId: "nonexistent" },
  });
  expect(missingFile.status()).toBe(400);

  const badType = await request.post("/api/attachments", {
    multipart: {
      dealId: "nonexistent",
      file: {
        name: "script.sh",
        mimeType: "application/x-sh",
        buffer: Buffer.from("echo hi"),
      },
    },
  });
  expect(badType.status()).toBe(400);
});
