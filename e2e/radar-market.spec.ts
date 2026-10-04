import type { Locator, Page } from "@playwright/test";
import { resetFixtures, runDb } from "./db";
import { expect, test } from "./fixtures";

// The Radar's "Market snapshot" (OR-28). The fixtures are in e2e/market-fixtures.ts; the clock is the real
// one, so the hours rules of IHSG and gold (closed or open) are computed here with a small independent
// implementation and are covered rule by rule in src/lib/market/hours.test.ts.

const copy = {
  en: {
    title: "Market snapshot",
    sample: "Sample",
    stale: "Out of date",
    short: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
    asOf: (time: string) => `As of ${time} WIB`,
    asOfEarlier: (date: string, time: string) => `As of ${date}, ${time} WIB`,
    asOfDate: (date: string) => `As of ${date}`,
    closed: (date: string) => `Market closed · last close ${date}`,
    staleLine: (when: string) => `Prices last updated ${when} WIB`,
    label: { up: (p: string) => `up ${p}`, down: (p: string) => `down ${p}`, flat: "unchanged" },
  },
  id: {
    title: "Ringkasan pasar",
    sample: "Contoh",
    stale: "Belum diperbarui",
    short: ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"],
    asOf: (time: string) => `Per ${time} WIB`,
    asOfEarlier: (date: string, time: string) => `Per ${date}, ${time} WIB`,
    asOfDate: (date: string) => `Per ${date}`,
    closed: (date: string) => `Pasar tutup · penutupan terakhir ${date}`,
    staleLine: (when: string) => `Harga terakhir diperbarui ${when} WIB`,
    label: { up: (p: string) => `naik ${p}`, down: (p: string) => `turun ${p}`, flat: "tidak berubah" },
  },
} as const;

type Locale = keyof typeof copy;

/** What the fixtures show, per row and language (see e2e/market-fixtures.ts for the numbers). */
const rows = [
  { slug: "ihsg", name: { en: "IHSG", id: "IHSG" }, price: { en: "7,412", id: "7.412" }, dir: "up", pct: { en: "0.6%", id: "0,6%" }, sample: false },
  { slug: "usd-idr", name: { en: "USD/IDR", id: "USD/IDR" }, price: { en: "16,240", id: "16.240" }, dir: "down", pct: { en: "0.2%", id: "0,2%" }, sample: true },
  { slug: "gold", name: { en: "Gold / gram", id: "Emas / gram" }, price: { en: "Rp 1,935,100", id: "Rp 1.935.100" }, dir: "flat", pct: { en: "0.0%", id: "0,0%" }, sample: false },
  { slug: "bitcoin", name: { en: "Bitcoin", id: "Bitcoin" }, price: { en: "$98,400", id: "US$98.400" }, dir: "down", pct: { en: "2.3%", id: "2,3%" }, sample: true },
] as const;

const arrow = { up: "▲", down: "▼", flat: "—" } as const;
const UP = "rgb(45, 212, 191)"; // #2DD4BF
const DOWN = "rgb(251, 146, 60)"; // #FB923C (the design's `down`)
const MUTED = "rgb(212, 206, 230)"; // #D4CEE6
const colour = { up: UP, down: DOWN, flat: MUTED } as const;

/** WIB weekday (0 = Monday) and clock parts of an instant, computed by hand. */
function wib(at: Date) {
  const s = new Date(at.getTime() + 7 * 3600_000);
  return { weekday: (s.getUTCDay() + 6) % 7, hour: s.getUTCHours(), minute: s.getUTCMinutes(), day: s.getUTCDate(), month: s.getUTCMonth(), ymd: s.toISOString().slice(0, 10) };
}
const clock = (at: Date, locale: Locale) => {
  const p = wib(at);
  return `${String(p.hour).padStart(2, "0")}${locale === "id" ? "." : ":"}${String(p.minute).padStart(2, "0")}`;
};
const dateOf = (at: Date, locale: Locale) => `${wib(at).day} ${copy[locale].short[wib(at).month]}`;

/** IDX: Mon-Fri 09:00-16:00 WIB. Gold: Mon 05:00 to Sat 04:00 WIB. Each says whether the market is shut right now. */
function closedNow(slug: string, at = new Date()) {
  const { weekday, hour, minute } = wib(at);
  const mins = hour * 60 + minute;
  if (slug === "ihsg") return !(weekday <= 4 && mins >= 9 * 60 && mins < 16 * 60);
  if (slug === "gold") return (weekday === 5 && mins >= 4 * 60) || weekday === 6 || (weekday === 0 && mins < 5 * 60);
  return false;
}

const main = (page: Page) => page.locator("main");
const market = (page: Page) => main(page).locator('section[aria-labelledby="radar-market"]');
const row = (page: Page, slug: string) => market(page).locator(`li[data-market="${slug}"]`);
const asOfOf = (page: Page, slug: string) => row(page, slug).locator("[data-market-asof]");
const box = async (locator: Locator) => (await locator.boundingBox())!;
const overflows = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);

for (const locale of ["en", "id"] as const) {
  const c = copy[locale];

  test(`${locale}: the section is the last on the page, titled, with IHSG, USD/IDR, Gold / gram and Bitcoin in that order, each with its price in this language`, async ({ page, baseURL }) => {
    const outside: string[] = [];
    page.on("request", (request) => {
      if (!/^(data|blob):/.test(request.url()) && new URL(request.url()).origin !== new URL(baseURL!).origin) outside.push(request.url());
    });

    await page.goto(`/${locale}`);
    await expect(market(page).getByRole("heading", { level: 2 })).toHaveText(c.title);
    await expect(market(page)).toHaveAttribute("aria-labelledby", "radar-market");
    // Last: no other section follows it, and it sits below the news section.
    await expect(main(page).locator("section").last()).toHaveAttribute("aria-labelledby", "radar-market");
    expect((await box(market(page))).y).toBeGreaterThan((await box(main(page).locator('section[aria-labelledby="radar-news"]'))).y);

    await expect(market(page).locator("li[data-market]")).toHaveCount(4);
    expect(await market(page).locator("li[data-market]").evaluateAll((items) => items.map((item) => item.getAttribute("data-market")))).toEqual(rows.map((r) => r.slug));
    for (const r of rows) {
      await expect(row(page, r.slug)).toContainText(r.name[locale]);
      await expect(row(page, r.slug).locator("[data-market-price]")).toHaveText(r.price[locale]);
    }
    // Nothing is requested from outside the app, and the other investment sections are still not built.
    expect(outside).toEqual([]);
    expect(await main(page).innerText()).not.toMatch(/investment alerts|peringatan investasi|financial advice|nasihat/i);
  });

  test(`${locale}: each change shows an arrow (or a dash) and the unsigned percent, in colour and in words`, async ({ page }) => {
    await page.goto(`/${locale}`);
    for (const r of rows) {
      const cell = row(page, r.slug).locator("[data-market-change]");
      await expect(cell).toHaveAttribute("data-market-change", r.dir);
      // What the eye sees: the arrow and the number, with the locale's decimal separator, never a bare 0%.
      await expect(cell.locator('[aria-hidden="true"]')).toHaveText(`${arrow[r.dir]} ${r.pct[locale]}`);
      // What a screen reader hears instead.
      const label = r.dir === "flat" ? c.label.flat : c.label[r.dir](r.pct[locale]);
      await expect(cell.locator(".sr-only")).toHaveText(label);
      // Teal up, orange down, muted unchanged; the sparkline takes the same colour.
      await expect(cell).toHaveCSS("color", colour[r.dir]);
      await expect(row(page, r.slug).locator("svg polyline")).toHaveCSS("stroke", colour[r.dir]);
    }
  });

  test(`${locale}: each row has a decorative 96 x 28 sparkline of 10 points`, async ({ page }) => {
    await page.goto(`/${locale}`);
    for (const r of rows) {
      const svg = row(page, r.slug).locator("svg[data-market-spark]");
      await expect(svg).toHaveAttribute("aria-hidden", "true");
      await expect(svg).toHaveAttribute("viewBox", "0 0 96 28");
      const points = (await svg.locator("polyline").getAttribute("points"))!.split(" ").map((p) => p.split(",").map(Number));
      expect(points).toHaveLength(10);
      expect(points[0][0]).toBe(0);
      expect(points[9][0]).toBe(96);
      for (const [x, y] of points) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(96);
        expect(y).toBeGreaterThanOrEqual(3);
        expect(y).toBeLessThanOrEqual(25);
      }
      const size = await box(svg);
      expect([Math.round(size.width), Math.round(size.height)]).toEqual([96, 28]);
    }
  });

  test(`${locale}: only the sample rows carry the dashed "${c.sample}" word, right beside the price`, async ({ page }) => {
    await page.goto(`/${locale}`);
    for (const r of rows) {
      const badge = row(page, r.slug).locator("[data-sample-badge]");
      if (!r.sample) {
        await expect(badge).toHaveCount(0);
        continue;
      }
      await expect(badge).toHaveText(c.sample);
      await expect(badge).toHaveCSS("border-top-style", "dashed");
      await expect(badge).toHaveCSS("color", MUTED);
      expect(await badge.evaluate((el) => parseFloat(getComputedStyle(el).borderTopLeftRadius))).toBeGreaterThan(100); // a pill
      // Same line as the price, to its right.
      const price = await box(row(page, r.slug).locator("[data-market-price]"));
      const word = await box(badge);
      expect(Math.abs(word.y + word.height / 2 - (price.y + price.height / 2))).toBeLessThan(12);
      expect(word.x).toBeGreaterThan(price.x + price.width - 1);
    }
  });

  test(`${locale}: the as-of line: the time today, the date for the USD/IDR rate, and "market closed" for IHSG and gold outside their hours`, async ({ page }) => {
    // Stored now (other tests reset the fixtures, which moves the quotes' as-of time).
    const marketAsOf = new Date(JSON.parse(runDb("fixtures")).marketAsOf);
    const before = { ihsg: closedNow("ihsg"), gold: closedNow("gold") };
    await page.goto(`/${locale}`);
    const after = { ihsg: closedNow("ihsg"), gold: closedNow("gold") };
    const sameDay = wib(marketAsOf).ymd === wib(new Date()).ymd;
    const timed = sameDay ? c.asOf(clock(marketAsOf, locale)) : c.asOfEarlier(dateOf(marketAsOf, locale), clock(marketAsOf, locale));

    for (const slug of ["ihsg", "gold"] as const) {
      if (before[slug] !== after[slug]) continue; // the market opened or closed while the page loaded
      await expect(asOfOf(page, slug)).toHaveText(before[slug] ? c.closed(dateOf(marketAsOf, locale)) : timed);
    }
    await expect(asOfOf(page, "bitcoin")).toHaveText(timed); // 24/7: never closed
    // A daily rate has a date and no time of day; its stored day is the UTC day of the other quotes.
    const day = new Date(`${marketAsOf.toISOString().slice(0, 10)}T00:00:00Z`);
    await expect(asOfOf(page, "usd-idr")).toHaveText(c.asOfDate(dateOf(day, locale)));
    // Fresh runs: no stale marker and no stale line.
    await expect(market(page).getByText(c.stale)).toHaveCount(0);
    await expect(page.getByRole("status")).toHaveCount(0);
  });

  test(`${locale}: a Bitcoin run 2 hours old (24/7) marks Bitcoin as out of date and adds one "Prices last updated" line; the other rows stay fresh`, async ({ page }) => {
    try {
      const { cryptoRun } = JSON.parse(runDb("fixtures", `--crypto-run=${120}`));
      const run = new Date(cryptoRun);
      await page.goto(`/${locale}`);
      const when = wib(run).ymd === wib(new Date()).ymd ? clock(run, locale) : `${dateOf(run, locale)}, ${clock(run, locale)}`;
      await expect(page.getByRole("status")).toHaveCount(1);
      await expect(market(page).getByRole("status")).toHaveText(c.staleLine(when));
      // The marker is a word after the as-of text, on Bitcoin only.
      await expect(market(page).getByText(c.stale, { exact: true })).toHaveCount(1);
      await expect(row(page, "bitcoin")).toContainText(c.stale);
      for (const slug of ["ihsg", "usd-idr", "gold"]) await expect(row(page, slug)).not.toContainText(c.stale);
      // The line sits above the rows.
      expect((await box(market(page).getByRole("status"))).y).toBeLessThan((await box(row(page, "ihsg"))).y);
    } finally {
      resetFixtures();
    }
  });

  test(`${locale}: a recent Bitcoin run (59 minutes) is not stale`, async ({ page }) => {
    try {
      runDb("fixtures", "--crypto-run=59");
      await page.goto(`/${locale}`);
      await expect(market(page).locator("li[data-market]")).toHaveCount(4);
      await expect(market(page).getByText(c.stale)).toHaveCount(0);
      await expect(page.getByRole("status")).toHaveCount(0);
    } finally {
      resetFixtures();
    }
  });

  test(`${locale}: without prices the section is left out, with no placeholder`, async ({ page }) => {
    try {
      runDb("fixtures", "--no-market");
      await page.goto(`/${locale}`);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(market(page)).toHaveCount(0);
      await expect(main(page)).not.toContainText(c.title);
      await expect(main(page).locator("section").last()).toHaveAttribute("aria-labelledby", "radar-news");
    } finally {
      resetFixtures();
    }
  });
}

test("one column on every width: price and change on one line, no sideways scroll, rows 4 in a column", async ({ page }) => {
  await page.goto("/en");
  expect(await overflows(page)).toBe(false);
  const widths = await Promise.all(["radar-brief", "radar-top", "radar-news", "radar-market"].map(async (id) => (await box(main(page).locator(`section[aria-labelledby="${id}"]`))).width));
  expect(new Set(widths.map(Math.round)).size).toBe(1);

  const ys = await Promise.all(rows.map(async (r) => (await box(row(page, r.slug))).y));
  expect([...ys].sort((a, b) => a - b)).toEqual(ys);

  const phone = page.viewportSize()!.width <= 400;
  for (const r of rows) {
    const price = await box(row(page, r.slug).locator("[data-market-price]"));
    const change = await box(row(page, r.slug).locator("[data-market-change]"));
    const spark = await box(row(page, r.slug).locator("svg[data-market-spark]"));
    expect(Math.abs(price.y - change.y), `${r.slug}: price and change are on one line`).toBeLessThan(24);
    if (phone) expect(spark.y, `${r.slug}: the sparkline is below the price`).toBeGreaterThan(price.y + price.height - 1);
    else expect(Math.abs(spark.y + spark.height / 2 - (price.y + price.height / 2)), `${r.slug}: the sparkline is beside the price`).toBeLessThan(30);
  }
});
