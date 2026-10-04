import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

const copy = {
  en: {
    nav: ["Radar", "Opportunities", "News", "Investments", "Calculators"],
    asset: "Asset report",
    empty: "Nothing here yet",
    language: "Language",
  },
  id: {
    nav: ["Radar", "Peluang", "Berita", "Investasi", "Kalkulator"],
    asset: "Laporan aset",
    empty: "Belum ada data",
    language: "Bahasa",
  },
} as const;

// path after the locale → [page title, index of the nav item that is current]
const routes = (locale: "en" | "id"): [string, string, number][] => [
  ["", copy[locale].nav[0], 0],
  ["/opportunities", copy[locale].nav[1], 1],
  ["/news", copy[locale].nav[2], 2],
  ["/invest", copy[locale].nav[3], 3],
  ["/invest/gold", copy[locale].asset, 3],
  ["/calculators", copy[locale].nav[4], 4],
];

const header = (page: Page) => page.getByRole("banner");

for (const locale of ["en", "id"] as const) {
  test(`${locale}: every screen has its title, empty frame and current nav item, and fits 360 px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 740 });

    for (const [path, title, currentIndex] of routes(locale)) {
      await page.goto(`/${locale}${path}`);
      await expect(page.getByRole("heading", { level: 1 }), path).toHaveText(title);
      // The calculators and news screens have content; the others still show the empty frame.
      if (path !== "/calculators" && path !== "/news") {
        await expect(page.locator("main"), path).toContainText(copy[locale].empty);
      }
      await expect(page, path).toHaveTitle(`${title} · Opportunity Radar`);

      const current = header(page).locator('[aria-current="page"]');
      await expect(current, path).toHaveCount(1);
      await expect(current, path).toHaveText(copy[locale].nav[currentIndex]);

      const overflows = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      expect(overflows, `${path} scrolls sideways at 360 px`).toBe(false);

      const links = [
        ...copy[locale].nav.map((name) => header(page).getByRole("navigation").getByRole("link", { name, exact: true })),
        ...["EN", "ID"].map((name) => header(page).getByRole("link", { name, exact: true })),
      ];
      for (const link of links) {
        await expect(link, path).toBeVisible();
        const box = (await link.boundingBox())!;
        expect(box.x >= 0 && box.x + box.width <= 360, `${path}: a header link is cut off`).toBe(true);
      }
    }
  });
}

test("each nav item opens its screen", async ({ page }) => {
  await page.goto("/en");
  const targets = ["/en/opportunities", "/en/news", "/en/invest", "/en/calculators", "/en"];
  const names = ["Opportunities", "News", "Investments", "Calculators", "Radar"];
  for (const [i, name] of names.entries()) {
    await header(page).getByRole("navigation").getByRole("link", { name, exact: true }).click();
    await expect(page).toHaveURL(targets[i]);
    await expect(header(page).locator('[aria-current="page"]')).toHaveText(name);
  }
});

test("the language switch keeps the path and query and remembers the choice", async ({ page }) => {
  await page.goto("/en/news?q=a%20b&x=1");
  await page.getByRole("group", { name: "Language" }).getByRole("link", { name: "ID" }).click();

  await expect(page).toHaveURL("/id/news?q=a%20b&x=1");
  await expect(header(page).locator('[aria-current="page"]')).toHaveText("Berita");
  await expect(page.getByRole("group", { name: "Bahasa" }).locator('[aria-current="true"]')).toHaveText("ID");

  const cookies = await page.context().cookies();
  expect(cookies.find((cookie) => cookie.name === "locale")?.value).toBe("id");

  const start = await page.request.get("/", { maxRedirects: 0 });
  expect(start.status()).toBe(307);
  expect(new URL(start.headers().location, "http://localhost").pathname).toBe("/id");

  await page.goBack();
  await expect(page).toHaveURL("/en/news?q=a%20b&x=1");
  await expect(header(page).locator('[aria-current="page"]')).toHaveText("News");
});

test("keyboard: Tab goes brand, nav items, language switch, each with a visible focus outline", async ({
  page,
}) => {
  await page.goto("/en");
  const seen: string[] = [];
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press("Tab");
    const focused = page.locator(":focus");
    seen.push((await focused.innerText()).trim());
    await expect(focused).toHaveCSS("outline-style", "solid");
    await expect(focused).toHaveCSS("outline-width", "2px");
  }
  expect(seen).toEqual(["Opportunity Radar", ...copy.en.nav, "EN", "ID"]);
});

test("the header has no alert bell and no sample-data badge", async ({ page }) => {
  await page.goto("/en");
  await expect(header(page)).not.toContainText(/sample data/i);
  await expect(header(page).locator('[aria-label*="lert" i]')).toHaveCount(0);
  await expect(header(page).getByRole("link")).toHaveCount(8);
});

test.describe("not-found and error pages", () => {
  test.use({ allowErrorResponses: true });

  test("an unknown path shows the localised not-found page with the header", async ({ page }) => {
    const response = await page.goto("/id/does-not-exist");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Halaman tidak ditemukan");
    await expect(page.locator("main")).toContainText("Halaman ini tidak ada.");
    await expect(header(page).getByRole("navigation")).toBeVisible();
    await expect(header(page).locator('[aria-current="page"]')).toHaveCount(0);

    await page.getByRole("group", { name: "Bahasa" }).getByRole("link", { name: "EN" }).click();
    await expect(page).toHaveURL("/en/does-not-exist");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Page not found");
    await page.getByRole("link", { name: "Back to Radar" }).click();
    await expect(page).toHaveURL("/en");
  });

  for (const [locale, title, retry] of [
    ["en", "Something went wrong", "Try again"],
    ["id", "Terjadi kesalahan", "Coba lagi"],
  ]) {
    test(`${locale}: a page that throws shows the error page without details`, async ({ page, pageProblems }) => {
      await page.goto(`/${locale}/dev/error`);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
      await expect(page.getByRole("button", { name: retry })).toBeVisible();
      await expect(header(page).getByRole("navigation")).toBeVisible();
      const text = await page.locator("body").innerText();
      expect(text).not.toContain("Test error route");
      expect(text).not.toMatch(/\bat .+\(.+:\d+:\d+\)/);
      // React reports the server error in the browser console; that is expected here.
      pageProblems.length = 0;
    });
  }
});
