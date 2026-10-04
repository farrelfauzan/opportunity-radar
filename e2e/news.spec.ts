import { spawn, type ChildProcess } from "node:child_process";
import net from "node:net";
import type { Page } from "@playwright/test";
import { e2eDatabaseUrl, e2ePort } from "../scripts/e2e-env";
import { runDb, resetFixtures } from "./db";
import { expect, test } from "./fixtures";
import { fixtureSources, headlines, longSourceName, todayStats } from "./news-fixtures";

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
  // 77 articles of 7 sources; the 8th configured source and yesterday's article are not counted.
  expect(stats).toEqual({ articles: 77, sources: 7 });
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

test("1280 px: the Sources panel sits beside the list", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/en/news");
  const listBox = (await page.locator("main ol").boundingBox())!;
  const panelBox = (await sourcesCard(page, "en").boundingBox())!;
  expect(panelBox.x).toBeGreaterThanOrEqual(listBox.x + listBox.width);
  expect(panelBox.y).toBeLessThan(listBox.y + 200);
  expect(await overflows(page)).toBe(false);
});

// ---- States ----------------------------------------------------------------------------------

test("a skeleton shows while the screen loads on client-side navigation", async ({ page }) => {
  // The header link prefetches the loading skeleton. Wait until the page is idle, so the
  // prefetch has finished and the skeleton is in the router cache; then slow the real request.
  await page.goto("/en/calculators", { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  await page.route(/\/en\/news/, async (route) => {
    if (!route.request().headers()["next-router-prefetch"]) await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.continue();
  });
  await page.getByRole("banner").getByRole("link", { name: "News", exact: true }).click();
  const skeleton = page.getByRole("status", { name: "Loading…" });
  await expect(skeleton).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("News");
  await expect(items(page).first()).toBeVisible();
  await expect(skeleton).toHaveCount(0);
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

// A second production server (same build) reaches the database through a small TCP
// proxy. The test stops the proxy, which is what "the database is stopped" looks like
// to the page, without touching the Postgres server other sessions share.
test.describe("store unreachable", () => {
  const port = e2ePort() + 1;
  const secret = "hunter2";
  let proxy: net.Server;
  let proxyPort = 0;
  const sockets = new Set<net.Socket>();
  let server: ChildProcess;

  // Each test starts its own proxy and server: the test stops the proxy.
  test.beforeEach(async () => {
    sockets.clear();
    const db = new URL(e2eDatabaseUrl());
    proxy = net.createServer((client) => {
      const upstream = net.connect(Number(db.port || 5432), db.hostname);
      for (const socket of [client, upstream]) {
        sockets.add(socket);
        socket.on("error", () => (client.destroy(), upstream.destroy()));
        socket.on("close", () => (client.destroy(), upstream.destroy()));
      }
      client.pipe(upstream);
      upstream.pipe(client);
    });
    await new Promise<void>((resolve) => proxy.listen(0, "127.0.0.1", resolve));
    proxyPort = (proxy.address() as net.AddressInfo).port;

    const url = new URL(db.href);
    url.username = "postgres";
    url.password = secret;
    url.hostname = "127.0.0.1";
    url.port = String(proxyPort);
    server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(port)], {
      env: { ...process.env, DATABASE_URL: url.href },
      stdio: "ignore",
    });
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch(`http://localhost:${port}/en/calculators`)).ok) return;
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    throw new Error("The second server did not start");
  });

  test.afterEach(async () => {
    proxy.close();
    for (const socket of sockets) socket.destroy();
    if (server.exitCode === null) {
      const exited = new Promise((resolve) => server.once("exit", resolve));
      server.kill();
      await exited;
    }
  });

  for (const locale of ["en", "id"] as const) {
    test(`${locale}: the error state shows no host, port, password or stack trace, and retry works`, async ({
      page,
    }) => {
      const c = copy[locale];
      const url = `http://localhost:${port}/${locale}/news?category=markets`;

      await page.goto(url);
      await expect(items(page).first()).toBeVisible();

      proxy.close();
      for (const socket of sockets) socket.destroy();

      await page.goto(url);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(c.title);
      await expect(page.locator("main")).toContainText(c.error[0]);
      const retry = page.getByRole("link", { name: c.error[1], exact: true });
      await expect(retry).toHaveAttribute("href", `/${locale}/news?category=markets`);
      await expect(items(page)).toHaveCount(0);
      // The header of the app is still there.
      await expect(page.getByRole("banner").getByRole("navigation")).toBeVisible();

      // Neither the visible text nor the HTML (with the page data) holds a detail.
      const html = await page.content();
      for (const detail of [
        secret,
        "127.0.0.1",
        String(proxyPort),
        "ECONNREFUSED",
        "CONNECTION",
        "opportunity_radar",
        "postgres://",
        "postgres",
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

      // Leave the page before the server is stopped, so no pending request fails after the test.
      await page.goto("about:blank");
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
