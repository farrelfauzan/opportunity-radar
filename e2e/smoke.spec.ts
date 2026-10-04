import { expect, test } from "./fixtures";

for (const path of ["/", "/en", "/id"]) {
  test(`${path} loads without errors`, async ({ page }) => {
    // networkidle, so errors logged during hydration are caught too.
    const response = await page.goto(path, { waitUntil: "networkidle" });
    expect(response?.status()).toBe(200);
    await expect(page.locator("body")).toBeVisible();
  });
}

// Proves the check in fixtures.ts trips. The test is expected to fail, so the
// run stays green; set E2E_SHOW_FAILURE=1 to see the real failure and a
// non-zero exit.
test("a page that logs a console error fails the run", async ({ page }) => {
  test.fail(!process.env.E2E_SHOW_FAILURE, "the console error must fail this test");
  await page.goto("/");
  await page.evaluate(() => console.error("deliberate console error"));
});
