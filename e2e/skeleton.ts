import { expect, type Page } from "@playwright/test";

/**
 * Navigates by clicking a header link and expects the loading skeleton while the real data
 * request is held back. The skeleton only shows when the link's prefetch has already put the
 * route's loading boundary in the router cache; on a busy machine that can come late. So the
 * whole sequence (fresh page, wait for the prefetch, hold the data request, click) is repeated
 * until the skeleton shows or the time is up. Without a loading.tsx it never shows, and the
 * test fails after the timeout, so it still proves the skeleton.
 */
export async function expectSkeletonOnNavigation(
  page: Page,
  options: {
    from: string;
    link: string;
    /** Matches the prefetch and the data request of the target route. */
    target: RegExp;
    /** Visible once the target page has loaded. */
    loaded: () => ReturnType<Page["locator"]>;
  },
) {
  await expect(async () => {
    await page.unrouteAll({ behavior: "ignoreErrors" });
    await page.goto(options.from, { waitUntil: "networkidle" });
    // The prefetch of the target shows up as a finished resource request.
    await page.waitForFunction(
      (source) => performance.getEntriesByType("resource").some((e) => new RegExp(source).test(e.name)),
      options.target.source,
      { timeout: 10_000 },
    );
    await page.route(options.target, async (route) => {
      if (!route.request().headers()["next-router-prefetch"]) await new Promise((resolve) => setTimeout(resolve, 2500));
      await route.continue();
    });
    await page.getByRole("banner").getByRole("link", { name: options.link, exact: true }).click();
    await expect(page.getByRole("status", { name: "Loading…" })).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 50_000, intervals: [0, 500, 1000] });

  // The held request is released: the page loads and the skeleton goes.
  await expect(options.loaded()).toBeVisible();
  await expect(page.getByRole("status", { name: "Loading…" })).toHaveCount(0);
  await page.unrouteAll({ behavior: "ignoreErrors" });
}
