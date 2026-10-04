import { expect, test } from "./fixtures";

// OR-61: a path with an encoded apostrophe (%27) used to send the browser into an endless loop of
// `?_rsc=` prefetch requests (the language-switch links point at the current path).
// Most of these paths are 404 pages on purpose.
test.use({ allowErrorResponses: true });

const paths = ["/en/zzz%27q", "/id/zzz%27q", "/en/invest/a%27b", "/en/opportunities/a%27b", "/en/news/a%27b"];

for (const path of paths) {
  test(`${path}: the page answers once and the browser goes quiet`, async ({ page }) => {
    let rsc = 0;
    page.on("request", (request) => {
      if (request.url().includes("_rsc=")) rsc++;
    });
    const response = await page.goto(path);
    expect([200, 404]).toContain(response!.status());
    await page.waitForTimeout(2000);
    // The header links prefetch a handful of routes; a loop makes hundreds.
    expect(rsc).toBeLessThan(30);
    const settled = rsc;
    await page.waitForTimeout(1000);
    expect(rsc - settled).toBeLessThan(3);
  });
}

test("the language switch still works from a path with %27, and stays quiet", async ({ page }) => {
  let rsc = 0;
  page.on("request", (request) => {
    if (request.url().includes("_rsc=")) rsc++;
  });
  await page.goto("/en/zzz%27q");
  await page.getByRole("group", { name: "Language" }).getByRole("link", { name: "ID" }).click();
  await expect(page).toHaveURL(/\/id\/zzz%27q$/);
  await page.waitForTimeout(2000);
  expect(rsc).toBeLessThan(40);
});

test("the locale redirect still applies to %27 paths", async ({ request }) => {
  for (const [from, to] of [
    ["/EN/%27", "/en/%27"],
    ["/Id/zzz%27q", "/id/zzz%27q"],
  ]) {
    const response = await request.get(from, { maxRedirects: 0 });
    expect(response.status(), from).toBe(308);
    expect(response.headers().location, from).toMatch(new RegExp(`${to}$`));
  }
});
