import type { Locator, Page } from "@playwright/test";
import { resetFixtures, runDb } from "./db";
import { expect, test } from "./fixtures";
import { fixtureVentures, relatedCount, ventureInjection } from "./venture-fixtures";

const copy = {
  en: {
    title: "My ventures",
    subtitle: "Progress from each project's board · market view re-scored daily from the news",
    progress: { mvp: "Progress to MVP", release: "Progress to next release" },
    notConnected: "Progress source not connected",
    oppId: "Opportunity · Indonesia",
    oppWorld: "Opportunity · Worldwide",
    tailwind: "Tailwind",
    headwind: "Headwind",
    noNews: "No related news this month",
    related: (n: number) => `${n} related news ${n === 1 ? "item" : "items"}`,
    noScore: "No score yet: no related news in the last 30 days",
    never: ["No data yet", "The first update runs at 07:00 WIB."],
    stale: (when: string) => `Venture data last updated ${when} WIB`,
    short: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
    open: (n: number) => `Open venture view · ${n} related news ${n === 1 ? "item" : "items"}`,
    pick: (pair: { en: string; id: string }) => pair.en,
    clock: ":",
  },
  id: {
    title: "Usaha saya",
    subtitle: "Progres dari papan tiap proyek · pandangan pasar dinilai ulang tiap hari dari berita",
    progress: { mvp: "Progres menuju MVP", release: "Progres menuju rilis berikutnya" },
    notConnected: "Sumber progres belum terhubung",
    oppId: "Peluang · Indonesia",
    oppWorld: "Peluang · Dunia",
    tailwind: "Pendorong",
    headwind: "Penghambat",
    noNews: "Belum ada berita terkait bulan ini",
    related: (n: number) => `${n} berita terkait`,
    noScore: "Belum ada skor: tidak ada berita terkait dalam 30 hari terakhir",
    never: ["Belum ada data", "Pembaruan pertama berjalan pukul 07.00 WIB."],
    stale: (when: string) => `Data usaha terakhir diperbarui ${when} WIB`,
    short: ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"],
    open: (n: number) => `Buka tampilan usaha · ${n} berita terkait`,
    pick: (pair: { en: string; id: string }) => pair.id,
    clock: ".",
  },
} as const;

const main = (page: Page) => page.locator("main");
const ventures = (page: Page) => main(page).locator('section[aria-labelledby="radar-ventures"]');
const card = (page: Page, slug: string) => ventures(page).locator(`li[data-venture="${slug}"]`);
const overflows = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
const box = async (locator: Locator) => (await locator.boundingBox())!;
const [connected, notConnected] = fixtureVentures;

/** "3 Oct, 07:00" in WIB, as the stale line writes it. */
function when(at: Date, locale: keyof typeof copy) {
  const p = new Date(at.getTime() + 7 * 3600_000);
  const clock = [p.getUTCHours(), p.getUTCMinutes()].map((n) => String(n).padStart(2, "0")).join(copy[locale].clock);
  return `${p.getUTCDate()} ${copy[locale].short[p.getUTCMonth()]}, ${clock}`;
}

for (const locale of ["en", "id"] as const) {
  const c = copy[locale];

  test.describe(`${locale}: My ventures`, () => {
    test.beforeAll(() => {
      resetFixtures();
    });

    test("sits directly after the brief and before Top opportunities, in the section order of the Radar", async ({ page }) => {
      await page.goto(`/${locale}`);
      await expect(ventures(page)).toBeVisible();
      const order = await main(page).evaluate((element) => [...element.querySelectorAll("section")].map((s) => s.getAttribute("aria-labelledby")));
      expect(order).toEqual(["radar-brief", "radar-ventures", "radar-top", "radar-news", "radar-market"]);
      await expect(ventures(page).getByRole("heading", { level: 2 })).toHaveText(c.title);
      await expect(ventures(page)).toContainText(c.subtitle);
      const y = async (id: string) => (await box(main(page).locator(`section[aria-labelledby="${id}"]`))).y;
      expect(await y("radar-brief")).toBeLessThan(await y("radar-ventures"));
      expect(await y("radar-ventures")).toBeLessThan(await y("radar-top"));
    });

    test("one card per venture, in order, with name and one-line description in this language", async ({ page }) => {
      await page.goto(`/${locale}`);
      await expect(ventures(page).locator("li[data-venture]")).toHaveCount(fixtureVentures.length);
      expect(await ventures(page).locator("li[data-venture]").evaluateAll((items) => items.map((i) => i.getAttribute("data-venture")))).toEqual(
        fixtureVentures.map((v) => v.slug),
      );
      for (const v of fixtureVentures) {
        await expect(card(page, v.slug).getByRole("heading", { level: 3 })).toHaveText(v.name);
        await expect(card(page, v.slug)).toContainText(c.pick(v.description));
        await expect(card(page, v.slug)).not.toContainText(locale === "en" ? v.description.id : v.description.en);
      }
    });

    test("a connected venture shows its progress label, bar and percent; the other says its source is not connected", async ({ page }) => {
      await page.goto(`/${locale}`);
      const bar = card(page, connected.slug).getByRole("progressbar", { name: c.progress.mvp });
      await expect(bar).toHaveAttribute("aria-valuenow", "62");
      await expect(bar).toHaveAttribute("aria-valuemin", "0");
      await expect(bar).toHaveAttribute("aria-valuemax", "100");
      await expect(card(page, connected.slug)).toContainText(c.progress.mvp);
      await expect(card(page, connected.slug)).toContainText("62%");
      expect((await box(bar.locator("span"))).width / (await box(bar)).width).toBeCloseTo(0.62, 1);

      await expect(card(page, notConnected.slug)).toContainText(c.notConnected);
      await expect(card(page, notConnected.slug).getByRole("progressbar")).toHaveCount(0);
      await expect(card(page, notConnected.slug)).not.toContainText(/%|MVP|rilis berikutnya|next release/);
      await expect(card(page, connected.slug)).not.toContainText(c.notConnected);
    });

    test("both market scores out of 100 with their change vs yesterday (▲, ▼, —), and a region without a score says so", async ({ page }) => {
      await page.goto(`/${locale}`);
      const score = (slug: string, region: string) => card(page, slug).locator(`[data-venture-score="${region}"]`);
      await expect(score(connected.slug, "indonesia")).toContainText(c.oppId);
      await expect(score(connected.slug, "indonesia")).toContainText("76");
      await expect(score(connected.slug, "indonesia")).toContainText("/ 100");
      await expect(score(connected.slug, "indonesia").locator("[data-trend]")).toHaveText("▲ 5");
      // The "76 / 100" notation is hidden from screen readers, which get "76 out of 100" instead.
      await expect(score(connected.slug, "indonesia").locator('[aria-hidden="true"]').first()).toContainText("76");
      await expect(score(connected.slug, "indonesia").locator(".sr-only").first()).toHaveText(locale === "en" ? "76 out of 100" : "76 dari 100");
      await expect(score(connected.slug, "global")).toContainText(c.oppWorld);
      await expect(score(connected.slug, "global")).toContainText("68");
      await expect(score(connected.slug, "global").locator("[data-trend]")).toHaveText("▼ 2");
      await expect(score(notConnected.slug, "indonesia")).toContainText("81");
      await expect(score(notConnected.slug, "indonesia").locator("[data-trend]")).toHaveText("— 0");
      await expect(score(notConnected.slug, "global")).toContainText(c.oppWorld);
      await expect(score(notConnected.slug, "global")).toContainText(c.noScore);
      await expect(score(notConnected.slug, "global").locator("[data-trend]")).toHaveCount(0);
      await expect(score(notConnected.slug, "global")).not.toContainText("/ 100");
    });

    test("one tailwind and one headwind per venture, labelled with the word, in this language", async ({ page }) => {
      await page.goto(`/${locale}`);
      for (const v of fixtureVentures) {
        await expect(card(page, v.slug).locator("[data-wind]")).toHaveCount(2);
        await expect(card(page, v.slug).locator('[data-wind="tailwind"]')).toHaveText(`${c.tailwind} · ${c.pick(v.winds.tailwind!)}`);
        await expect(card(page, v.slug).locator('[data-wind="headwind"]')).toHaveText(`${c.headwind} · ${c.pick(v.winds.headwind!)}`);
      }
    });

    test("the count of related news (relevance 50 or more) is the link to the venture view; none says there is none, without a link", async ({ page }) => {
      expect(relatedCount(connected)).toBe(2);
      await page.goto(`/${locale}`);
      const open = card(page, connected.slug).locator("[data-venture-news]");
      await expect(open).toHaveText(c.open(2));
      await expect(open).toHaveAttribute("href", `/${locale}/ventures/${connected.slug}`);
      expect((await box(open)).height).toBeGreaterThanOrEqual(44);
      await expect(card(page, notConnected.slug).locator("[data-venture-news]")).toHaveText(c.noNews);
      await expect(card(page, notConnected.slug)).not.toContainText(c.open(0));
      await expect(card(page, notConnected.slug).getByRole("link")).toHaveCount(0);
      // One link per venture with related news, and no other link to a venture screen on the page.
      await expect(ventures(page).getByRole("link")).toHaveCount(fixtureVentures.filter((v) => relatedCount(v) > 0).length);
      await expect(page.locator('a[href*="/ventures"]')).toHaveCount(fixtureVentures.filter((v) => relatedCount(v) > 0).length);
    });

    test("a score that is not from today or yesterday says so; today's and yesterday's do not", async ({ page }) => {
      await page.goto(`/${locale}`);
      await expect(ventures(page).locator("[data-score-asof]")).toHaveCount(0);
      try {
        // Move every market row 9 days back: the newest rows are then old.
        runDb("fixtures", "--venture-market-age=9");
        await page.goto(`/${locale}`);
        const asOf = card(page, connected.slug).locator('[data-venture-score="indonesia"] [data-score-asof]');
        await expect(asOf).toHaveText(new RegExp(`^${locale === "en" ? "As of" : "Per"} \\d{1,2} ${c.short.join("|")}$`));
        // A region without a score shows no date.
        await expect(card(page, notConnected.slug).locator('[data-venture-score="global"] [data-score-asof]')).toHaveCount(0);
      } finally {
        resetFixtures();
      }
    });

    test("descriptions and winds are text: markup shows as written and nothing executes", async ({ page, baseURL }) => {
      const outside: string[] = [];
      page.on("request", (request) => {
        if (!/^(data|blob):/.test(request.url()) && new URL(request.url()).origin !== new URL(baseURL!).origin) outside.push(request.url());
      });
      await page.goto(`/${locale}`);
      await expect(card(page, connected.slug).locator('[data-wind="tailwind"]')).toContainText(ventureInjection);
      await expect(card(page, notConnected.slug)).toContainText(locale === "en" ? "<b>bold</b>" : "<b>tebal</b>");
      await expect(ventures(page).locator("script, b")).toHaveCount(0);
      expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
      expect(outside).toEqual([]);
    });

    test("a very long word in every text does not scroll the page sideways", async ({ page }) => {
      await page.goto(`/${locale}`);
      expect(await overflows(page)).toBe(false);
      await page.evaluate(() => {
        const word = "Superpanjang".repeat(17);
        document.querySelectorAll("section[aria-labelledby=radar-ventures] h3, section[aria-labelledby=radar-ventures] li > div p, section[aria-labelledby=radar-ventures] [data-wind]").forEach((element) => element.append(word));
      });
      expect(await overflows(page), "a long text scrolls the page sideways").toBe(false);
    });

    test("a ventures run more than 26 hours old says so in the section, with its WIB date and time; 25 hours does not", async ({ page }) => {
      try {
        runDb("fixtures", `--ventures-run=${25 * 60}`);
        await page.goto(`/${locale}`);
        await expect(ventures(page).locator("li[data-venture]")).toHaveCount(fixtureVentures.length);
        await expect(page.getByRole("status")).toHaveCount(0);

        const { venturesRun } = JSON.parse(runDb("fixtures", `--ventures-run=${27 * 60}`));
        await page.goto(`/${locale}`);
        await expect(page.getByRole("status")).toHaveCount(1);
        await expect(ventures(page).getByRole("status")).toHaveText(c.stale(when(new Date(venturesRun), locale)));
        // The stored content is still shown.
        await expect(card(page, connected.slug)).toContainText("76");
      } finally {
        resetFixtures();
      }
    });

    test("ventures not scored yet show the 'no data yet' text with the first update time, not 'no related news'", async ({ page }) => {
      try {
        runDb("fixtures", "--no-venture-market");
        await page.goto(`/${locale}`);
        for (const v of fixtureVentures) {
          const never = card(page, v.slug).locator("[data-venture-never]");
          await expect(never).toContainText(c.never[0]);
          await expect(never).toContainText(c.never[1]);
          await expect(card(page, v.slug).locator("[data-venture-score]")).toHaveCount(0);
          await expect(card(page, v.slug).locator("[data-wind]")).toHaveCount(0);
          await expect(card(page, v.slug)).not.toContainText(c.noNews);
          await expect(card(page, v.slug)).not.toContainText(c.noScore);
        }
        // Progress is independent of the market view.
        await expect(card(page, connected.slug).getByRole("progressbar")).toHaveCount(1);
        await expect(card(page, notConnected.slug)).toContainText(c.notConnected);
      } finally {
        resetFixtures();
      }
    });

    test("without ventures the section is left out, with no placeholder", async ({ page }) => {
      try {
        runDb("fixtures", "--no-ventures");
        await page.goto(`/${locale}`);
        await expect(main(page).locator('section[aria-labelledby="radar-top"]')).toBeVisible();
        await expect(ventures(page)).toHaveCount(0);
        await expect(main(page)).not.toContainText(c.title);
        await expect(main(page)).not.toContainText(c.subtitle);
        expect(await main(page).evaluate((element) => [...element.querySelectorAll("section")].map((s) => s.getAttribute("aria-labelledby")))).toEqual([
          "radar-brief", "radar-top", "radar-news", "radar-market",
        ]);
      } finally {
        resetFixtures();
      }
    });
  });
}

test("the cards sit side by side on a wide screen and stack on a phone", async ({ page }) => {
  await page.goto("/en");
  const first = await box(card(page, connected.slug));
  const second = await box(card(page, notConnected.slug));
  if ((page.viewportSize()?.width ?? 0) >= 1024) {
    expect(Math.abs(first.y - second.y)).toBeLessThan(2);
    expect(second.x).toBeGreaterThan(first.x + first.width - 1);
  } else {
    expect(second.y).toBeGreaterThan(first.y + first.height - 1);
    expect(Math.round(first.width)).toBe(Math.round(second.width));
  }
  expect(await overflows(page)).toBe(false);
});
