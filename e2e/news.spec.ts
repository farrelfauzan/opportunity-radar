import type { Locator, Page } from "@playwright/test";
import { e2eDatabaseUrl } from "../scripts/e2e-env";
import { runDb, resetFixtures } from "./db";
import { expect, test } from "./fixtures";
import { expectSkeletonOnNavigation } from "./skeleton";
import { expectedThemes, fixtureSources, headlines, longSourceName, todayStats } from "./news-fixtures";
import { fixtureOpportunities } from "./opportunity-fixtures";

const stats = todayStats();

const copy = {
  en: {
    title: "News",
    summary: `${stats.articles} articles today · ${stats.sources} sources · refreshed every 30 minutes`,
    all: "All",
    tech: "Tech & AI",
    business: "Business",
    markets: "Markets",
    commodities: "Commodities",
    regionLabel: "Region",
    global: "Global",
    empty: "No articles for this filter",
    loadMore: "Load more",
    sources: "Sources",
    note: "Headlines and links only; the full article opens on the publisher's site.",
    stale: (when: string) => `News last updated ${when} WIB`,
    never: ["No data yet", "The first news check runs within 30 minutes."],
    error: ["Can't load this right now", "Try again"],
    language: "Language",
    agoMinutes: /^\d+m ago$/,
    twoHours: "2h ago",
  },
  id: {
    title: "Berita",
    summary: `${stats.articles} artikel hari ini · ${stats.sources} sumber · diperbarui setiap 30 menit`,
    all: "Semua",
    tech: "Teknologi & AI",
    business: "Bisnis",
    markets: "Pasar",
    commodities: "Komoditas",
    regionLabel: "Wilayah",
    global: "Global",
    empty: "Tidak ada artikel untuk filter ini",
    loadMore: "Muat lebih banyak",
    sources: "Sumber",
    note: "Hanya judul dan tautan; artikel lengkap dibuka di situs penerbit.",
    stale: (when: string) => `Berita terakhir diperbarui ${when} WIB`,
    never: ["Belum ada data", "Pemeriksaan berita pertama berjalan dalam 30 menit."],
    error: ["Tidak dapat memuat sekarang", "Coba lagi"],
    language: "Bahasa",
    agoMinutes: /^\d+ mnt lalu$/,
    twoHours: "2 jam lalu",
  },
} as const;

const items = (page: Page) => page.locator("main ol > li");
const chip = (page: Page, name: string) => page.getByRole("link", { name, exact: true });
const overflows = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);

/** The Sources card, found by its heading. */
const sourcesCard = (page: Page, locale: "en" | "id") =>
  page.locator('[data-slot="card"]').filter({ has: page.getByRole("heading", { name: copy[locale].sources }) });

const MONTHS = {
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  id: ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"],
};

/** WIB clock parts of an instant. */
function wib(at: Date) {
  const shifted = new Date(at.getTime() + 7 * 3600_000);
  return {
    day: shifted.getUTCDate(),
    month: shifted.getUTCMonth(),
    key: shifted.toISOString().slice(0, 10),
    clock: [shifted.getUTCHours(), shifted.getUTCMinutes()].map((n) => String(n).padStart(2, "0")),
  };
}

// ---- Acceptance criteria -------------------------------------------------------------------

test("AC1: today's articles show newest first, with source, time, region and a headline that opens in a new tab", async ({
  page,
  context,
}) => {
  await page.goto("/en/news");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("News");
  await expect(page).toHaveTitle("News · Opportunity Radar");

  // 5 minutes old, so it is the newest of all the articles.
  const first = items(page).first();
  await expect(first).toContainText(headlines.newest);
  await expect(first).toContainText("Tech & AI");
  await expect(first).toContainText(/TechCrunch · \d+m ago · Global/);

  const link = first.getByRole("link", { name: headlines.newest });
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  const href = (await link.getAttribute("href"))!;
  expect(href).toMatch(/^https:\/\/example\.com\/e2e\//);

  // Newest first: an article of 80 minutes comes before the one of 2 hours.
  await page.goto("/en/news?category=politics&region=indonesia");
  await expect(items(page)).toHaveCount(3); // + the licensed-source article, 121 minutes old
  await expect(items(page).nth(0)).not.toContainText(headlines.twoHours);
  await expect(items(page).nth(1)).toContainText(headlines.twoHours);
  await expect(items(page).nth(1)).toContainText("Antara · 2h ago · Indonesia");

  // The link opens the publisher's page in a new tab (the publisher is stubbed: no real request).
  await context.route("https://example.com/**", (route) =>
    route.fulfill({ contentType: "text/html", body: "<title>Publisher</title>" }),
  );
  const [popup] = await Promise.all([
    page.waitForEvent("popup"),
    items(page).first().getByRole("link").click(),
  ]);
  expect(popup.url()).toMatch(/^https:\/\/example\.com\/e2e\/politics\/indonesia\//);
  await popup.close();
  await expect(page).toHaveURL(/\/en\/news\?category=politics&region=indonesia$/);
});

test("AC2: Tech & AI + Global shows only those articles and the URL holds both filters, after reload and in ID", async ({
  page,
}) => {
  await page.goto("/en/news");
  await chip(page, "Tech & AI").click();
  await expect(page).toHaveURL("/en/news?category=tech-ai");
  await expect(chip(page, "Tech & AI")).toHaveAttribute("aria-current", "true");

  await page.getByLabel("Region").selectOption("global");
  await expect(page).toHaveURL("/en/news?category=tech-ai&region=global");
  await expect(items(page)).toHaveCount(30);
  for (const text of await items(page).allInnerTexts()) {
    expect(text).toContain("Tech & AI");
    expect(text).toMatch(/· Global/);
  }

  await page.reload();
  await expect(page).toHaveURL("/en/news?category=tech-ai&region=global");
  await expect(items(page)).toHaveCount(30);
  await expect(page.getByLabel("Region")).toHaveValue("global");

  await page.getByRole("group", { name: "Language" }).getByRole("link", { name: "ID" }).click();
  await expect(page).toHaveURL("/id/news?category=tech-ai&region=global");
  await expect(items(page)).toHaveCount(30);
  await expect(chip(page, "Teknologi & AI")).toHaveAttribute("aria-current", "true");
  await expect(page.getByLabel("Wilayah")).toHaveValue("global");
  for (const text of await items(page).allInnerTexts()) {
    expect(text).toContain("Teknologi & AI");
    expect(text).toMatch(/· Global/);
  }

  // Each filter on its own, and a pair from the other side.
  await page.goto("/en/news?region=indonesia");
  for (const text of await items(page).allInnerTexts()) expect(text).toMatch(/· Indonesia/);
  await page.goto("/en/news?category=business&region=indonesia");
  await expect(items(page)).toHaveCount(2);
});

for (const locale of ["en", "id"] as const) {
  const c = copy[locale];

  test(`${locale} AC3: the last successful ingestion more than 2 hours ago shows the stale banner with the WIB time`, async ({
    page,
  }) => {
    try {
      // Fresh: no banner.
      await page.goto(`/${locale}/news`);
      await expect(items(page).first()).toBeVisible();
      await expect(page.getByRole("status")).toHaveCount(0);

      // 3 hours ago, which can be yesterday in the first hours after WIB midnight.
      const { lastRun } = JSON.parse(runDb("fixtures", "--last-run=180"));
      const then = wib(new Date(lastRun));
      const time = then.clock.join(locale === "id" ? "." : ":");
      const date = wib(new Date());
      const when = then.key === date.key ? time : `${then.day} ${MONTHS[locale][then.month]}, ${time}`;

      await page.goto(`/${locale}/news`);
      await expect(page.getByRole("status")).toHaveText(c.stale(when));
      // The stored articles are still listed under the banner.
      await expect(items(page)).toHaveCount(30);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(c.title);
    } finally {
      resetFixtures();
    }
  });

  test(`${locale}: a last update on an earlier day shows the date as well`, async ({ page }) => {
    try {
      const yesterday = wib(new Date(Date.now() - 24 * 3600_000));
      runDb("fixtures", `--last-run=${yesterday.key}T09:30:00+07:00`);
      await page.goto(`/${locale}/news`);
      const time = locale === "id" ? "09.30" : "09:30";
      await expect(page.getByRole("status")).toHaveText(
        c.stale(`${yesterday.day} ${MONTHS[locale][yesterday.month]}, ${time}`),
      );
      await expect(items(page)).toHaveCount(30);
    } finally {
      resetFixtures();
    }
  });

  test(`${locale} AC4: a filter without articles shows the empty state in the current language`, async ({ page }) => {
    // Commodities + Global has no article in the fixtures.
    await page.goto(`/${locale}/news?category=commodities&region=global`);
    await expect(page.locator("main")).toContainText(c.empty);
    await expect(items(page)).toHaveCount(0);
    await expect(page.getByRole("link", { name: c.loadMore })).toHaveCount(0);
    // The header still describes the whole day, and the filters stay usable.
    await expect(page.locator("main")).toContainText(c.summary);
    await expect(chip(page, c.commodities)).toHaveAttribute("aria-current", "true");
    await chip(page, c.all).click();
    await expect(items(page)).toHaveCount(30);
  });
}

test("AC5: /id/news is all Indonesian except the headlines", async ({ page }) => {
  await page.goto("/id/news");
  const c = copy.id;
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Berita");
  await expect(page).toHaveTitle("Berita · Opportunity Radar");
  await expect(page.locator("html")).toHaveAttribute("lang", "id");
  const main = page.locator("main");
  await expect(main).toContainText(c.summary);
  for (const name of [c.all, c.business, c.tech, c.markets, c.commodities, "Politik & kebijakan"]) {
    await expect(chip(page, name)).toBeVisible();
  }
  await expect(page.getByLabel(c.regionLabel)).toBeVisible();
  await expect(page.getByLabel(c.regionLabel).locator("option")).toHaveText([
    "Indonesia + Global",
    "Indonesia",
    "Global",
  ]);
  await expect(page.getByRole("link", { name: c.loadMore })).toBeVisible();
  await expect(sourcesCard(page, "id")).toContainText(c.note);
  await expect(items(page).first()).toContainText(/TechCrunch · \d+ mnt lalu · Global/);

  // The headlines stay as stored: English and Indonesian ones are both untouched.
  await expect(items(page).first()).toContainText(headlines.newest);
  await page.goto("/id/news?category=politics&region=indonesia");
  await expect(items(page).nth(1)).toContainText(headlines.twoHours);
  await expect(items(page).nth(1)).toContainText("Antara · 2 jam lalu · Indonesia");

  // No English UI copy is left on the page.
  const text = await main.innerText();
  for (const english of ["Load more", "articles today", "refreshed every", "No articles", "Region", "ago ·"]) {
    expect(text).not.toContain(english);
  }
});

// ---- Content, links and the network ----------------------------------------------------------

test("a headline and a snippet with markup show literally and nothing executes", async ({ page }) => {
  await page.goto("/en/news?category=business&region=global");
  const item = items(page).filter({ hasText: "Shipping" }).first();
  await expect(item).toBeVisible();
  const markup = items(page).filter({ hasText: "window.__pwned" }).first();
  await expect(markup.getByRole("link")).toHaveText(headlines.markup + ". Opens on the publisher's site");
  await expect(markup).toContainText(headlines.markupSnippet);
  await expect(page.locator("main img, main script, main b")).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
  // The only link inside the item is the headline, and it is the stored https address.
  await expect(markup.locator("a")).toHaveCount(1);
  await expect(markup.locator("a")).toHaveAttribute("href", /^https:\/\/example\.com\//);
});

test("the browser makes no request to any other origin", async ({ page, baseURL }) => {
  const origins = new Set<string>();
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.protocol === "http:" || url.protocol === "https:") origins.add(url.origin);
  });
  await page.goto("/en/news");
  await chip(page, "Business").click();
  await expect(page).toHaveURL("/en/news?category=business");
  await page.getByLabel("Region").selectOption("indonesia");
  await expect(page).toHaveURL("/en/news?category=business&region=indonesia");
  await page.goto("/id/news");
  await page.getByRole("link", { name: copy.id.loadMore }).click();
  await expect(items(page)).toHaveCount(60);
  expect([...origins]).toEqual([new URL(baseURL!).origin]);
});

test("invalid query values fall back to All without an error", async ({ page }) => {
  await page.goto("/en/news?category=xyz&region=1&shown=abc");
  await expect(chip(page, "All")).toHaveAttribute("aria-current", "true");
  await expect(page.getByLabel("Region")).toHaveValue("all");
  await expect(items(page)).toHaveCount(30);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("News");
  await expect(page.locator("main")).not.toContainText(copy.en.empty);
});

test("a day parameter in the URL is ignored: the page always shows today", async ({ page }) => {
  for (const day of ["2026-02-30", "2026-10-03", "garbage"]) {
    const response = await page.goto(`/en/news?day=${day}`);
    expect(response?.status(), day).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("News");
    await expect(page.locator("main")).toContainText(copy.en.summary);
    await expect(items(page)).toHaveCount(30);
    await expect(items(page).first()).toContainText(headlines.newest);
    await expect(page.locator("main")).not.toContainText(copy.en.error[0]);
  }
});

test("the header counts describe the whole day, not the filter", async ({ page }) => {
  for (const locale of ["en", "id"] as const) {
    await page.goto(`/${locale}/news`);
    await expect(page.locator("main")).toContainText(copy[locale].summary);
    await page.goto(`/${locale}/news?category=commodities&region=indonesia`);
    await expect(page.locator("main")).toContainText(copy[locale].summary);
    await expect(items(page)).toHaveCount(2);
  }
  // 77 articles of 7 sources, plus the 5 of OR-21 (none from a new source); the 8th configured source,
  // yesterday's article and the earlier days' triaged ones (themes only) are not counted.
  expect(stats).toEqual({ articles: 82, sources: 7 });
  expect(fixtureSources).toHaveLength(8);
});

test("the Sources panel lists the configured sources by region with the note", async ({ page }) => {
  await page.goto("/en/news");
  const card = sourcesCard(page, "en");
  await expect(card).toContainText(`Indonesia: Antara, CNBC Indonesia, Katadata, ${longSourceName}, The Conversation Indonesia`);
  await expect(card).toContainText("Global: BBC Business, European Central Bank, TechCrunch");
  await expect(card).toContainText(copy.en.note);
});

// ---- Pagination -----------------------------------------------------------------------------

test("30 items show no Load more, 31 items show it; a filter change resets the page", async ({ page }) => {
  // Tech & AI + Global has exactly 30.
  await page.goto("/en/news?category=tech-ai&region=global");
  await expect(items(page)).toHaveCount(30);
  await expect(page.getByRole("link", { name: "Load more" })).toHaveCount(0);

  // Markets + Indonesia has exactly 31.
  await page.goto("/en/news?category=markets&region=indonesia");
  await expect(items(page)).toHaveCount(30);
  // A plain link to a server-rendered URL, not a script-driven button.
  await expect(page.getByRole("link", { name: "Load more" })).toHaveAttribute(
    "href",
    "/en/news?category=markets&region=indonesia&shown=60",
  );
  await page.getByRole("link", { name: "Load more" }).click();
  await expect(page).toHaveURL("/en/news?category=markets&region=indonesia&shown=60");
  await expect(items(page)).toHaveCount(31);
  await expect(page.getByRole("link", { name: "Load more" })).toHaveCount(0);
  await page.reload();
  await expect(items(page)).toHaveCount(31);

  // A filter change goes back to the first page.
  await chip(page, "Business").click();
  await expect(page).toHaveURL("/en/news?category=business&region=indonesia");
  await page.goBack();
  await page.getByLabel("Region").selectOption("all");
  await expect(page).toHaveURL("/en/news?category=markets");
  await expect(items(page)).toHaveCount(30);
  await expect(page.getByRole("link", { name: "Load more" })).toHaveCount(1);
});

test("Load more steps through all the articles", async ({ page }) => {
  await page.goto("/en/news");
  await expect(items(page)).toHaveCount(30);
  await page.getByRole("link", { name: "Load more" }).click();
  await expect(items(page)).toHaveCount(60);
  await page.getByRole("link", { name: "Load more" }).click();
  await expect(page).toHaveURL("/en/news?shown=90");
  await expect(items(page)).toHaveCount(stats.articles);
  await expect(page.getByRole("link", { name: "Load more" })).toHaveCount(0);
});

// ---- Layout ----------------------------------------------------------------------------------

test("390 px: no sideways scroll with a very long headline and source name, chips wrap, panel below the list", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/en/news?category=business&region=indonesia");
  const long = items(page).filter({ hasText: headlines.long.slice(0, 40) });
  await expect(long).toHaveCount(1);
  await expect(long).toContainText(longSourceName);
  expect(await overflows(page)).toBe(false);
  const box = (await long.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);

  await page.goto("/id/news");
  expect(await overflows(page)).toBe(false);
  for (const name of ["Semua", "Bisnis", "Politik & kebijakan", "Teknologi & AI", "Pasar", "Komoditas"]) {
    const chipBox = (await chip(page, name).boundingBox())!;
    expect(chipBox.x + chipBox.width, name).toBeLessThanOrEqual(390);
  }
  // The Sources panel is under the list (the whole page is one column).
  const listBox = (await page.locator("main ol").boundingBox())!;
  const panelBox = (await sourcesCard(page, "id").boundingBox())!;
  expect(panelBox.y).toBeGreaterThanOrEqual(listBox.y + listBox.height);
});

test("1280 px: the Sources panel sits beside the list, under the Trending themes panel", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/en/news");
  const listBox = (await page.locator("main ol").boundingBox())!;
  const themesBox = (await themesCard(page, "en").boundingBox())!;
  const panelBox = (await sourcesCard(page, "en").boundingBox())!;
  expect(panelBox.x).toBeGreaterThanOrEqual(listBox.x + listBox.width);
  expect(themesBox.y).toBeLessThan(listBox.y + 200);
  expect(panelBox.y).toBeGreaterThanOrEqual(themesBox.y + themesBox.height);
  expect(await overflows(page)).toBe(false);
});

// ---- States ----------------------------------------------------------------------------------

test("a skeleton shows while the screen loads on client-side navigation", async ({ page }) => {
  await expectSkeletonOnNavigation(page, {
    from: "/en/calculators",
    link: "News",
    target: /\/en\/news/,
    loaded: () => items(page).first(),
  });
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("News");
});

for (const locale of ["en", "id"] as const) {
  test(`${locale}: before the first ingestion the screen says so`, async ({ page }) => {
    try {
      runDb("fixtures", "--last-run=never", "--no-articles");
      await page.goto(`/${locale}/news`);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(copy[locale].title);
      await expect(page.locator("main")).toContainText(copy[locale].never[0]);
      await expect(page.locator("main")).toContainText(copy[locale].never[1]);
      await expect(page.getByRole("status")).toHaveCount(0);
      await expect(items(page)).toHaveCount(0);
    } finally {
      resetFixtures();
    }
  });
}

test("a newly stored article shows on reload", async ({ page }) => {
  const headline = "Freshly stored headline for the reload test";
  try {
    await page.goto("/en/news");
    await expect(page.getByText(headline)).toHaveCount(0);
    await expect(page.locator("main")).toContainText(`${stats.articles} articles today`);

    runDb("add", headline);
    await page.reload();
    await expect(items(page).first()).toContainText(headline);
    await expect(items(page).first()).toContainText(/Antara · (just now|1m ago) · Indonesia/);
    await expect(page.locator("main")).toContainText(`${stats.articles + 1} articles today`);
  } finally {
    resetFixtures();
  }
});

// ---- Store unreachable -----------------------------------------------------------------------

// The store is "down" for the page when the table it reads is missing: the test renames the
// table away in its own e2e database and back, so the running server is used and nothing else
// is started (a second server and a TCP proxy were too slow and fragile on a busy machine).
test.describe("store unreachable", () => {
  for (const locale of ["en", "id"] as const) {
    test(`${locale}: the error state shows no host, port, password or stack trace, and retry works`, async ({
      page,
    }) => {
      const c = copy[locale];
      const url = `/${locale}/news?category=markets`;

      await page.goto(url);
      await expect(items(page).first()).toBeVisible();

      try {
        runDb("break", "articles");
        await page.goto(url);
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(c.title);
        await expect(page.locator("main")).toContainText(c.error[0]);
        const retry = page.getByRole("link", { name: c.error[1], exact: true });
        await expect(retry).toHaveAttribute("href", url);
        await expect(items(page)).toHaveCount(0);
        // The header of the app is still there.
        await expect(page.getByRole("banner").getByRole("navigation")).toBeVisible();

        // Neither the visible text nor the HTML (with the page data) holds a detail.
        const db = new URL(e2eDatabaseUrl());
        const html = await page.content();
        for (const detail of [
          db.hostname,
          db.port,
          db.pathname.slice(1),
          "postgres://",
          "postgres",
          'relation "', // what a database says about a missing table
          "42P01",
          "__off",
          "ECONNREFUSED",
          "Failed query", // what the driver's error says, with the SQL
          "params:",
          "digest",
          "node_modules",
          "    at ",
        ]) {
          expect(html, `the page leaks "${detail}"`).not.toContain(detail);
        }

        // The store is still down, so the retry link brings the same state back.
        await retry.click();
        await expect(page).toHaveURL(url);
        await expect(page.locator("main")).toContainText(c.error[0]);
      } finally {
        runDb("restore", "articles");
      }

      // And once the store is back the same URL shows the news again.
      await page.goto(url);
      await expect(items(page).first()).toBeVisible();
    });
  }
});

test("items from licensed sources carry a credit line; others do not", async ({ page }) => {
  const deed = "https://creativecommons.org/licenses/by-nd/4.0/";
  const item = (headline: string) => page.getByRole("listitem").filter({ hasText: headline });

  await page.goto("/en/news?category=politics&region=indonesia");
  const conversation = item(headlines.conversation);
  await expect(conversation).toContainText("Source: The Conversation Indonesia · CC BY-ND 4.0");
  const licence = conversation.getByRole("link", { name: "CC BY-ND 4.0" });
  await expect(licence).toHaveAttribute("href", deed);
  await expect(licence).toHaveAttribute("target", "_blank");
  await expect(licence).toHaveAttribute("rel", "noopener noreferrer");
  // No derivatives: the summary is shown as stored, in its own language, also on /en.
  await expect(conversation).toContainText("Ringkasan yang dipakai apa adanya.");
  await expect(item("Aturan sertifikasi halal diperluas")).not.toContainText("Source:");

  await page.goto("/id/news?category=politics&region=indonesia");
  await expect(item(headlines.conversation)).toContainText("Sumber: The Conversation Indonesia · CC BY-ND 4.0");
  await expect(item(headlines.conversation)).toContainText("Ringkasan yang dipakai apa adanya.");

  await page.goto("/en/news?category=markets&region=global");
  const ecb = item(headlines.ecb);
  await expect(ecb).toContainText("Source: European Central Bank");
  await expect(ecb).not.toContainText("CC BY");
  await expect(ecb.getByRole("link")).toHaveCount(1); // the headline is the required link to the original
  await expect(item("Stocks edge higher ahead of rate decision")).not.toContainText("Source:");

  await page.goto("/id/news?category=markets&region=global");
  await expect(item(headlines.ecb)).toContainText("Sumber: Bank Sentral Eropa (ECB)");
});

test("switching a source off drops its articles from the list, the header counts and the Sources panel", async ({
  page,
}) => {
  try {
    // "kemendag" has exactly one article today (the one with the very long headline).
    runDb("deactivate", "kemendag");
    await page.goto("/en/news");
    await expect(page.locator("main")).toContainText(
      `${stats.articles - 1} articles today · ${stats.sources - 1} sources · refreshed every 30 minutes`,
    );
    await expect(items(page).filter({ hasText: headlines.long.slice(0, 40) })).toHaveCount(0);
    await expect(sourcesCard(page, "en")).not.toContainText(longSourceName);
    await expect(sourcesCard(page, "en")).toContainText("Indonesia: Antara, CNBC Indonesia, Katadata, The Conversation Indonesia");

    // The same rule holds under a filter that used to show it.
    await page.goto("/en/news?category=business&region=indonesia");
    await expect(items(page)).toHaveCount(1);
    await expect(items(page).first()).toContainText("UMKM digital tumbuh di luar Jawa");
  } finally {
    resetFixtures();
  }
});

// ---- Partial state (OR-59) -------------------------------------------------------------------

const activeSources = fixtureSources.length; // all fixture sources are active
const partialLine = {
  en: (ok: number, names: string) => `${ok} of ${activeSources} sources updated · not updated: ${names}`,
  id: (ok: number, names: string) => `${ok} dari ${activeSources} sumber diperbarui · belum diperbarui: ${names}`,
};

test("one source failed on the latest run: the Sources panel says so in EN and ID, with no page banner", async ({
  page,
}) => {
  try {
    runDb("source-status", "katadata", "403");
    runDb("source-status", "antara", "304"); // an unchanged feed is a successful check
    for (const locale of ["en", "id"] as const) {
      await page.goto(`/${locale}/news`);
      const card = sourcesCard(page, locale);
      await expect(card).toContainText(partialLine[locale](activeSources - 1, "Katadata"));
      await expect(card).toContainText(`Katadata — ${locale === "en" ? "not updated" : "belum diperbarui"}`);
      await expect(card).not.toContainText(`Antara — `);
      await expect(page.getByRole("status")).toHaveCount(0); // no page-level banner
    }
  } finally {
    resetFixtures();
  }
});

test("every source ok or 304: no partial line", async ({ page }) => {
  try {
    runDb("source-status", "antara", "200");
    runDb("source-status", "katadata", "304");
    await page.goto("/en/news");
    await expect(sourcesCard(page, "en")).toContainText(copy.en.note);
    await expect(sourcesCard(page, "en")).not.toContainText("sources updated");
    await expect(sourcesCard(page, "en")).not.toContainText("not updated");
  } finally {
    resetFixtures();
  }
});

test("all sources failed: 0 of N, every name listed", async ({ page }) => {
  try {
    for (const source of fixtureSources) runDb("source-status", source.slug, "503");
    await page.goto("/en/news");
    const card = sourcesCard(page, "en");
    await expect(card).toContainText(`0 of ${activeSources} sources updated · not updated:`);
    await expect(card).toContainText("Katadata");
    await expect(card).toContainText(longSourceName);
  } finally {
    resetFixtures();
  }
});

test("while the news is stale only the stale banner shows, not the partial line", async ({ page }) => {
  try {
    runDb("fixtures", "--last-run=180");
    runDb("source-status", "katadata", "403");
    await page.goto("/en/news");
    await expect(page.getByRole("status")).toContainText("News last updated");
    await expect(sourcesCard(page, "en")).not.toContainText("sources updated");
    await expect(sourcesCard(page, "en")).not.toContainText("not updated");
  } finally {
    resetFixtures();
  }
});

test("an inactive source that failed is neither counted nor listed", async ({ page }) => {
  try {
    runDb("source-status", "katadata", "403");
    runDb("deactivate", "katadata");
    await page.goto("/en/news");
    const card = sourcesCard(page, "en");
    await expect(card).not.toContainText("Katadata");
    await expect(card).not.toContainText("sources updated");
  } finally {
    resetFixtures();
  }
});

test("the category chips form a named group", async ({ page }) => {
  await page.goto("/en/news");
  await expect(page.getByRole("group", { name: "Category" }).getByRole("link")).toHaveCount(6);
  await page.goto("/id/news");
  await expect(page.getByRole("group", { name: "Kategori" }).getByRole("link")).toHaveCount(6);
});

// ---- OR-21: impact, why it matters, linked opportunity, the toggle and the themes panel ---------------

const oppId = (key: string) => fixtureOpportunities.findIndex((f) => f.key === key) + 1; // stored in this order, ids from 1
const oppTitle = (key: string, locale: "en" | "id") => fixtureOpportunities[oppId(key) - 1].title[locale];

const why = {
  en: {
    tariff: "Lower import costs speed up builds, so suppliers of cooling and power win.",
    rupiah: "Importers lose margin when the dollar rises.",
    gold: "Background for anyone pricing gold or cross-border trade.",
    conversation: "Rice prices shape food costs for every household and for small food businesses.",
  },
  id: {
    tariff: "Biaya impor yang lebih rendah mempercepat pembangunan, sehingga pemasok pendingin dan listrik diuntungkan.",
    rupiah: "Importir kehilangan margin ketika dolar menguat.",
    gold: "Latar belakang bagi yang menghitung harga emas atau perdagangan lintas negara.",
    conversation: "Harga beras memengaruhi biaya pangan setiap rumah tangga dan usaha makanan kecil.",
  },
} as const;

const copy2 = {
  en: {
    impact: { opportunity: "Opportunity", risk: "Risk", context: "Context" },
    why: "Why it matters",
    linked: (title: string) => `Linked opportunity: ${title}`,
    onlyLinked: "Only news linked to an opportunity",
    themes: "Trending themes, 7 days",
    caption: "Number of articles mentioning each theme.",
    themeNames: [
      "Data centres & cloud",
      "AI adoption in business",
      "Rupiah & currency moves",
      "Trade, tariffs & sanctions",
      "Food security & agriculture",
      "Gold & commodity prices",
    ],
    other: ["Other", "Interest rates & central banks"],
    politics: "Politics & policy",
    business: "Business",
    indonesia: "Indonesia",
  },
  id: {
    impact: { opportunity: "Peluang", risk: "Risiko", context: "Konteks" },
    why: "Mengapa penting",
    linked: (title: string) => `Peluang terkait: ${title}`,
    onlyLinked: "Hanya berita yang terkait peluang",
    themes: "Tema populer, 7 hari",
    caption: "Jumlah artikel yang menyebut setiap tema.",
    themeNames: [
      "Pusat data & cloud",
      "Adopsi AI di bisnis",
      "Rupiah & pergerakan kurs",
      "Perdagangan, tarif & sanksi",
      "Ketahanan pangan & pertanian",
      "Emas & harga komoditas",
    ],
    other: ["Lainnya", "Suku bunga & bank sentral"],
    politics: "Politik & kebijakan",
    business: "Bisnis",
    indonesia: "Indonesia",
  },
} as const;

const item = (page: Page, headline: string) => items(page).filter({ hasText: headline });
/** The category word of an item: the first span of its card (the source name is not it). */
const categoryOf = (card: Locator) => card.locator("span").first();
const themesCard = (page: Page, locale: "en" | "id") =>
  page.locator('[data-slot="card"]').filter({ has: page.getByRole("heading", { name: copy2[locale].themes }) });
const linkedToggle = (page: Page, locale: "en" | "id") => page.getByRole("checkbox", { name: copy2[locale].onlyLinked });

// The impact colours of docs/design/News.dc.html: foreground on background.
const impactColours = {
  opportunity: ["rgb(94, 234, 212)", "rgb(29, 75, 72)"],
  risk: ["rgb(253, 186, 116)", "rgb(90, 51, 32)"],
  context: ["rgb(226, 221, 240)", "rgb(75, 62, 117)"],
} as const;

for (const locale of ["en", "id"] as const) {
  const c = copy2[locale];
  const other = locale === "en" ? "id" : "en";

  test(`${locale}: an item shows its impact word at the right end of the meta row, with its colours`, async ({ page }) => {
    await page.goto(`/${locale}/news`);
    for (const [impact, headline] of [
      ["opportunity", headlines.tariff],
      ["risk", headlines.rupiah],
      ["context", headlines.gold],
    ] as const) {
      const card = item(page, headline);
      const pill = card.getByText(c.impact[impact], { exact: true });
      await expect(pill).toHaveCount(1);
      const [fg, bg] = impactColours[impact];
      await expect(pill).toHaveCSS("color", fg);
      await expect(pill).toHaveCSS("background-color", bg);
      // margin-left:auto: the word sits at the right end of the card, whatever the width.
      const box = (await pill.boundingBox())!;
      const cardBox = (await card.boundingBox())!;
      expect(box.x + box.width).toBeGreaterThan(cardBox.x + cardBox.width - 24);
      expect(box.x + box.width).toBeLessThanOrEqual(cardBox.x + cardBox.width);
      // Never the other languages' word.
      await expect(card.getByText(copy2[other].impact[impact], { exact: true })).toHaveCount(0);
    }
    expect(await overflows(page)).toBe(false);
  });

  test(`${locale}: the why block is in the current language and apart from the snippet`, async ({ page }) => {
    await page.goto(`/${locale}/news`);
    const card = item(page, headlines.tariff);
    const label = card.getByText(c.why, { exact: true });
    await expect(label).toHaveCSS("color", "rgb(45, 212, 191)");
    await expect(card.getByText(why[locale].tariff, { exact: true })).toBeVisible();
    await expect(card).not.toContainText(why[other].tariff);
    // Label and text are one block with its own background, not part of the snippet paragraph.
    const block = label.locator("xpath=ancestor::div[1]");
    await expect(block).toContainText(why[locale].tariff);
    await expect(block).toHaveCSS("background-color", /^(rgba\(0, 0, 0, 0\.18\)|oklab\(0 0 0 \/ 0\.18\))$/);
    await expect(card.locator("p", { hasText: why[locale].tariff })).toHaveCount(0);
    await expect(card.locator("p").first()).toContainText("Snippet of:");
    expect(await overflows(page)).toBe(false);
  });

  test(`${locale}: the linked opportunity is the open one with the highest score, and its link opens that opportunity`, async ({
    page,
  }) => {
    await page.goto(`/${locale}/news`);
    // Cited by three: Tax tool (71), Earthquake (55) and a closed one with 99, which never links.
    const card = item(page, headlines.tariff);
    const link = card.getByRole("link", { name: c.linked(oppTitle("tax", locale)), exact: true });
    await expect(link).toHaveAttribute("href", `/${locale}/opportunities/${oppId("tax")}`);
    await expect(card.getByRole("link", { name: /Closed opportunity|Peluang tertutup/ })).toHaveCount(0);
    await expect(card.getByRole("link")).toHaveCount(2); // the headline and the opportunity

    // Cited by one open and nothing else, and by a closed one only.
    await expect(item(page, headlines.gold).getByRole("link", { name: c.linked(oppTitle("last-mile", locale)), exact: true })).toHaveAttribute(
      "href",
      `/${locale}/opportunities/${oppId("last-mile")}`,
    );
    await expect(item(page, headlines.rupiah).getByRole("link")).toHaveCount(1); // only the headline

    await link.click();
    await expect(page).toHaveURL(`/${locale}/opportunities/${oppId("tax")}`);
    await expect(page.getByRole("heading", { level: 2 })).toHaveText(oppTitle("tax", locale));
  });

  test(`${locale}: an item without triage has no tag, no why block and no placeholder; a cited one still links`, async ({
    page,
  }) => {
    await page.goto(`/${locale}/news`);
    const words = new RegExp(`^(${Object.values(c.impact).join("|")})$`);
    // Never triaged and not cited: headline, source and time only (plus its snippet).
    for (const [headline, category] of [
      [headlines.newest, locale === "en" ? "Tech & AI" : "Teknologi & AI"],
      [headlines.failed, c.business], // triage failed: it keeps its feed category
    ] as const) {
      const card = item(page, headline);
      await expect(card).toHaveCount(1);
      await expect(categoryOf(card)).toHaveText(category);
      await expect(card.getByText(words)).toHaveCount(0);
      await expect(card.getByText(c.why, { exact: true })).toHaveCount(0);
      await expect(card.getByRole("link")).toHaveCount(1);
      await expect(card.locator("p")).toHaveCount(1); // the snippet only
    }
    // Not triaged yet but cited by two open opportunities with the same score: the lower id links.
    const cited = item(page, headlines.coldChain);
    await expect(cited.getByText(words)).toHaveCount(0);
    await expect(cited.getByText(c.why, { exact: true })).toHaveCount(0);
    await expect(cited.getByRole("link", { name: c.linked(oppTitle("climate", locale)), exact: true })).toHaveAttribute(
      "href",
      `/${locale}/opportunities/${oppId("climate")}`,
    );
    await expect(cited.getByRole("link")).toHaveCount(2);
  });

  test(`${locale}: the category comes from triage, and from the feed when there is none`, async ({ page }) => {
    await page.goto(`/${locale}/news`);
    // Stored with the feed category business; triage read it as politics.
    await expect(categoryOf(item(page, headlines.tariff))).toHaveText(c.politics);
    // Triage agrees with the feed.
    await expect(categoryOf(item(page, headlines.rupiah))).toHaveText(locale === "en" ? "Markets" : "Pasar");
    // No triage, or a failed one: the feed category.
    await expect(categoryOf(item(page, headlines.newest))).toHaveText(locale === "en" ? "Tech & AI" : "Teknologi & AI");
    await expect(categoryOf(item(page, headlines.failed))).toHaveText(c.business);
    // The filters use the same category.
    await page.goto(`/${locale}/news?category=politics&region=global`);
    await expect(item(page, headlines.tariff)).toHaveCount(1);
    await page.goto(`/${locale}/news?category=business&region=global`);
    await expect(item(page, headlines.tariff)).toHaveCount(0);
    await expect(item(page, headlines.failed)).toHaveCount(1);
  });

  test(`${locale}: the Conversation item keeps its snippet exactly as stored next to a why block`, async ({ page }) => {
    await page.goto(`/${locale}/news?category=politics&region=indonesia`);
    const card = item(page, headlines.conversation);
    await expect(card.locator("p").filter({ hasText: "Ringkasan" })).toHaveText("Ringkasan yang dipakai apa adanya.");
    await expect(card.getByText(why[locale].conversation, { exact: true })).toBeVisible();
    await expect(card.getByText(c.why, { exact: true })).toBeVisible();
    await expect(card).toContainText(locale === "en" ? "Source: The Conversation Indonesia · CC BY-ND 4.0" : "Sumber: The Conversation Indonesia · CC BY-ND 4.0");
    await expect(card.locator("p", { hasText: why[locale].conversation })).toHaveCount(0);
    await expect(card.getByText(c.impact.context, { exact: true })).toBeVisible();
  });

  test(`${locale}: the toggle shows only news an open opportunity cites; the URL holds it and combines with the filters`, async ({
    page,
  }) => {
    await page.goto(`/${locale}/news`);
    const toggle = linkedToggle(page, locale);
    await expect(toggle).not.toBeChecked();
    await toggle.check();
    await expect(page).toHaveURL(`/${locale}/news?linked=1`);
    await expect(toggle).toBeChecked();
    // Cited by an open opportunity: three. Cited only by a closed one (rupiah), or by none, do not show.
    await expect(items(page)).toHaveCount(3);
    for (const headline of [headlines.tariff, headlines.gold, headlines.coldChain]) await expect(item(page, headline)).toHaveCount(1);
    await expect(item(page, headlines.rupiah)).toHaveCount(0);
    // The header still describes the whole day.
    await expect(page.locator("main")).toContainText(copy[locale].summary);

    await page.reload();
    await expect(page).toHaveURL(`/${locale}/news?linked=1`);
    await expect(linkedToggle(page, locale)).toBeChecked();
    await expect(items(page)).toHaveCount(3);

    // Combined with the category and the region; every link keeps the toggle.
    await page.getByRole("link", { name: c.business, exact: true }).click();
    await expect(page).toHaveURL(`/${locale}/news?category=business&linked=1`);
    await expect(items(page)).toHaveCount(1);
    await expect(items(page).first()).toContainText(headlines.gold);
    await page.getByLabel(copy[locale].regionLabel).selectOption("indonesia");
    await expect(page).toHaveURL(`/${locale}/news?category=business&region=indonesia&linked=1`);
    await expect(page.locator("main")).toContainText(copy[locale].empty);
    await expect(items(page)).toHaveCount(0);
    await expect(page.locator("main")).toContainText(copy[locale].summary);
    await page.getByRole("link", { name: copy[locale].all, exact: true }).click();
    await expect(page).toHaveURL(`/${locale}/news?region=indonesia&linked=1`);
    await expect(items(page)).toHaveCount(1);
    await expect(items(page).first()).toContainText(headlines.coldChain);

    // Off again: the parameter goes, the other filters stay.
    await linkedToggle(page, locale).uncheck();
    await expect(page).toHaveURL(`/${locale}/news?region=indonesia`);
    await expect(items(page).first()).toBeVisible();
    expect(await items(page).count()).toBeGreaterThan(3);
  });

  test(`${locale}: only ?linked=1 turns the toggle on`, async ({ page }) => {
    for (const value of ["0", "true", "on", "", "11"]) {
      await page.goto(`/${locale}/news?linked=${value}`);
      await expect(linkedToggle(page, locale)).not.toBeChecked();
      await expect(items(page)).toHaveCount(30);
    }
  });

  test(`${locale}: the toggle is a real checkbox with a focus ring, a 44px target and keyboard use`, async ({ page }) => {
    await page.goto(`/${locale}/news`);
    const toggle = linkedToggle(page, locale);
    expect((await toggle.locator("xpath=..").boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await page.getByLabel(copy[locale].regionLabel).focus();
    await page.keyboard.press("Tab");
    await expect(toggle).toBeFocused();
    await expect(toggle).toHaveCSS("outline-style", "solid");
    await expect(toggle).toHaveCSS("outline-width", "2px");
    await page.keyboard.press("Space");
    await expect(page).toHaveURL(`/${locale}/news?linked=1`);
    await expect(toggle).toBeChecked();
    await expect(toggle).toBeFocused(); // the keyboard user keeps their place
    expect(await overflows(page)).toBe(false);
  });

  test(`${locale}: the themes panel shows the top 6 by article count with bars and the printed number`, async ({ page }) => {
    await page.goto(`/${locale}/news`);
    const card = themesCard(page, locale);
    await expect(card).toHaveCount(1);
    await expect(card).toContainText(c.caption);
    const rows = card.getByRole("listitem");
    await expect(rows).toHaveCount(6);
    const meters = card.getByRole("meter");
    await expect(meters).toHaveCount(6);
    const max = expectedThemes[0].count;
    for (const [index, { count }] of expectedThemes.entries()) {
      await expect(meters.nth(index)).toHaveAttribute("aria-label", c.themeNames[index]);
      await expect(meters.nth(index)).toHaveAttribute("aria-valuemin", "0");
      await expect(meters.nth(index)).toHaveAttribute("aria-valuemax", String(max));
      await expect(meters.nth(index)).toHaveAttribute("aria-valuenow", String(count));
      await expect(rows.nth(index)).toHaveText(`${c.themeNames[index]}${count}`);
      await expect(meters.nth(index).locator("span")).toHaveAttribute("style", new RegExp(`width:\\s*${Math.round((count / max) * 100)}%`));
    }
    // Left out: the theme "other" (the most frequent of all), the 7th theme, and the article 7 days ago.
    for (const text of c.other) await expect(card).not.toContainText(text);
    expect(await overflows(page)).toBe(false);
  });

  test(`${locale}: the themes panel comes before the Sources panel: beside the list on a wide screen, below it on a phone`, async ({
    page,
  }) => {
    await page.goto(`/${locale}/news`);
    const list = (await page.locator("main ol").boundingBox())!;
    const sourcesBox = (await sourcesCard(page, locale).boundingBox())!;
    const themesBox = (await themesCard(page, locale).boundingBox())!;
    expect(sourcesBox.y).toBeGreaterThanOrEqual(themesBox.y + themesBox.height);
    expect(themesBox.x).toBeGreaterThanOrEqual(0);
    expect(themesBox.x + themesBox.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    if (page.viewportSize()!.width >= 1000) {
      expect(themesBox.x).toBeGreaterThanOrEqual(list.x + list.width);
    } else {
      expect(themesBox.y).toBeGreaterThanOrEqual(list.y + list.height);
      expect(sourcesBox.y).toBeGreaterThanOrEqual(list.y + list.height);
    }
    expect(await overflows(page)).toBe(false);
  });

  test(`${locale}: with no triaged article in the last 7 days the themes panel is left out`, async ({ page }) => {
    try {
      runDb("fixtures", "--no-articles");
      await page.goto(`/${locale}/news`);
      await expect(sourcesCard(page, locale)).toHaveCount(1);
      await expect(page.getByRole("heading", { name: c.themes })).toHaveCount(0);
      await expect(page.getByRole("meter")).toHaveCount(0);
    } finally {
      resetFixtures();
    }
  });
}

test("the language switch keeps the toggle and shows the why in Indonesian", async ({ page }) => {
  await page.goto("/en/news?linked=1");
  await page.getByRole("group", { name: "Language" }).getByRole("link", { name: "ID" }).click();
  await expect(page).toHaveURL("/id/news?linked=1");
  await expect(linkedToggle(page, "id")).toBeChecked();
  await expect(items(page)).toHaveCount(3);
  await expect(item(page, headlines.tariff)).toContainText(why.id.tariff);
});

for (const locale of ["en", "id"] as const) {
  test(`${locale}: every "why it matters" text carries the AI mark, and nothing else does`, async ({ page }) => {
    const label = locale === "en" ? "Why it matters" : "Mengapa penting";
    const aiSr =
      locale === "en"
        ? "Written by AI from the article, not by the publisher"
        : "Ditulis oleh AI dari artikel, bukan oleh penerbit";
    await page.goto(`/${locale}/news`);
    const whys = await page.getByText(label, { exact: true }).count();
    expect(whys).toBeGreaterThan(0);
    await expect(page.locator(`[title="${aiSr}"]`)).toHaveCount(whys);
    // The publisher's snippet and the credit line never carry it.
    await expect(page.locator("p", { hasText: "Ringkasan yang dipakai apa adanya." }).locator(`[title="${aiSr}"]`)).toHaveCount(0);
  });
}
