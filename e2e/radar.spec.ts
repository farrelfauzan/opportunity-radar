import type { Locator, Page } from "@playwright/test";
import { runDb, resetFixtures } from "./db";
import { expect, test } from "./fixtures";
import { briefInjection, fixtureBriefLines } from "./radar-fixtures";
import { headlines, todayStats } from "./news-fixtures";
import { evidenceArticles, fixtureOpportunities, listedFixtures, longEvidenceHeadline, openFixtures } from "./opportunity-fixtures";
import { e2eDatabaseUrl } from "../scripts/e2e-env";
import { expectSkeletonOnNavigation } from "./skeleton";

const listed = listedFixtures();
const top = listed.slice(0, 5);
const idOf = (key: string) => fixtureOpportunities.findIndex((f) => f.key === key) + 1; // stored in this order, ids from 1
const evidence = (key: string) => evidenceArticles.find((e) => e.key === key)!;
/**
 * The linked articles the Radar shows, newest first: the newest five of the cited ones. Three are News fixtures
 * from the last minutes of today (OR-21: tariff and gold triaged, cold chain not), then the two newest opportunity
 * evidence articles (the "off" one, the ECB one and the rest are older).
 */
type Linked = { key: string; headline: string; category: keyof (typeof copy)["en"]["cat"]; region: "indonesia" | "global"; why?: { en: string; id: string }; fresh?: true; ageDays?: number };
const linked: Linked[] = [
  { key: "tariff", headline: headlines.tariff, category: "politics", region: "global", fresh: true, why: { en: "Lower import costs speed up builds, so suppliers of cooling and power win.", id: "Biaya impor yang lebih rendah mempercepat pembangunan, sehingga pemasok pendingin dan listrik diuntungkan." } },
  { key: "gold", headline: headlines.gold, category: "business", region: "global", fresh: true, why: { en: "Background for anyone pricing gold or cross-border trade.", id: "Latar belakang bagi yang menghitung harga emas atau perdagangan lintas negara." } },
  { key: "coldchain", headline: headlines.coldChain, category: "tech-ai", region: "indonesia", fresh: true },
  ...["antara", "conversation"].map((key) => {
    const e = evidence(key);
    return { key, headline: e.headline, category: e.category ?? "business", region: e.region ?? "indonesia", why: e.why, ageDays: e.ageDays } satisfies Linked;
  }),
];

const copy = {
  en: {
    title: "Today's radar",
    updated: (date: string, time: string) => `${date} · updated ${time} WIB`,
    brief: "Daily brief — what changed for business opportunities",
    briefNone: "Not enough news yet today",
    source: (articles: number, sources: number) => `AI summary of ${articles} articles from ${sources} sources`,
    affected: (n: number) => `${n} ${n === 1 ? "opportunity" : "opportunities"} affected`,
    cat: { business: "Business", politics: "Politics & policy", "tech-ai": "Tech & AI", markets: "Markets", commodities: "Commodities" },
    top: "Top opportunities",
    seeAll: (n: number) => `See all (${n})`,
    score: "score",
    horizon: { "0-6m": "Horizon 0–6 months", "6-12m": "Horizon 6–12 months", "1-3y": "Horizon 1–3 years" },
    region: { indonesia: "Indonesia", global: "Global" },
    sector: {
      logistics: "Logistics & Supply Chain", fisheries_maritime: "Fisheries & Maritime", renewables_climate: "Renewables & Climate",
      ai_software: "AI & Software", retail_ecommerce: "Retail & E-commerce", fintech_finance: "Fintech & Financial Services", agri_food: "Agriculture & Food",
    } as Record<string, string>,
    basedOn: (n: number) => `Based on ${n} news ${n === 1 ? "item" : "items"}`,
    why: "Why it matters",
    aiSr: "Written by AI from the article, not by the publisher",
    topEmpty: "No opportunities yet. The first morning run is at 07:00 WIB.",
    news: "News that moves opportunities",
    allNews: "All news",
    ago: (days: number) => `${days}d ago`,
    credit: { conversation: "Source: The Conversation Indonesia · CC BY-ND 4.0", ecb: "Source: European Central Bank" },
    new: "New",
    never: ["No data yet", "The first update runs at 07:00 WIB."],
    stale: (when: string) => `Opportunities last updated ${when} WIB`,
    staleBrief: (when: string) => `The daily brief last updated ${when} WIB`,
    linkedTo: (n: number) => `Linked to ${n} ${n === 1 ? "opportunity" : "opportunities"}`,
    error: ["Can't load this right now", "Try again"],
    weekdays: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
    months: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
    short: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
    pick: (pair: { en: string; id: string }) => pair.en,
  },
  id: {
    title: "Radar hari ini",
    updated: (date: string, time: string) => `${date} · diperbarui ${time} WIB`,
    brief: "Ringkasan harian — apa yang berubah bagi peluang bisnis",
    briefNone: "Belum cukup berita hari ini",
    source: (articles: number, sources: number) => `Ringkasan AI dari ${articles} artikel, ${sources} sumber`,
    affected: (n: number) => `${n} peluang terdampak`,
    cat: { business: "Bisnis", politics: "Politik & kebijakan", "tech-ai": "Teknologi & AI", markets: "Pasar", commodities: "Komoditas" },
    top: "Peluang teratas",
    seeAll: (n: number) => `Lihat semua (${n})`,
    score: "skor",
    horizon: { "0-6m": "Horizon 0–6 bulan", "6-12m": "Horizon 6–12 bulan", "1-3y": "Horizon 1–3 tahun" },
    region: { indonesia: "Indonesia", global: "Global" },
    sector: {
      logistics: "Logistik & Rantai Pasok", fisheries_maritime: "Perikanan & Maritim", renewables_climate: "Energi Terbarukan & Iklim",
      ai_software: "AI & Perangkat Lunak", retail_ecommerce: "Ritel & E-commerce", fintech_finance: "Fintech & Jasa Keuangan", agri_food: "Pertanian & Pangan",
    } as Record<string, string>,
    basedOn: (n: number) => `Berdasarkan ${n} berita`,
    why: "Mengapa penting",
    aiSr: "Ditulis oleh AI dari artikel, bukan oleh penerbit",
    topEmpty: "Belum ada peluang. Proses pagi pertama berjalan pukul 07.00 WIB.",
    news: "Berita yang menggerakkan peluang",
    allNews: "Semua berita",
    ago: (days: number) => `${days} hari lalu`,
    credit: { conversation: "Sumber: The Conversation Indonesia · CC BY-ND 4.0", ecb: "Sumber: Bank Sentral Eropa (ECB)" },
    new: "Baru",
    never: ["Belum ada data", "Pembaruan pertama berjalan pukul 07.00 WIB."],
    stale: (when: string) => `Peluang terakhir diperbarui ${when} WIB`,
    staleBrief: (when: string) => `Ringkasan harian terakhir diperbarui ${when} WIB`,
    linkedTo: (n: number) => `Terkait ${n} peluang`,
    error: ["Tidak dapat memuat sekarang", "Coba lagi"],
    weekdays: ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"],
    months: ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"],
    short: ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"],
    pick: (pair: { en: string; id: string }) => pair.id,
  },
} as const;

type Locale = keyof typeof copy;

/** The trend of each top fixture, as the card shows it (the history is in e2e/opportunity-fixtures.ts). */
const trendOf = (locale: Locale, key: string) =>
  ({ "cold-chain": "▲ 12", solar: "▼ 7", assistant: "— 0", tax: "▲ 9", climate: copy[locale].new })[key]!;

/** WIB calendar and clock parts of an instant. */
function wib(at: Date) {
  const shifted = new Date(at.getTime() + 7 * 3600_000);
  return {
    weekday: shifted.getUTCDay(),
    day: shifted.getUTCDate(),
    month: shifted.getUTCMonth(),
    year: shifted.getUTCFullYear(),
    clock: [shifted.getUTCHours(), shifted.getUTCMinutes()].map((n) => String(n).padStart(2, "0")),
  };
}
const clockOf = (at: Date, locale: Locale) => wib(at).clock.join(locale === "id" ? "." : ":");
const longDate = (at: Date, locale: Locale) => {
  const p = wib(at);
  return `${copy[locale].weekdays[p.weekday]}, ${p.day} ${copy[locale].months[p.month]} ${p.year}`;
};

const main = (page: Page) => page.locator("main");
const section = (page: Page, id: string) => main(page).locator(`section[aria-labelledby="${id}"]`);
const briefItems = (page: Page) => section(page, "radar-brief").locator("ol > li");
const topItems = (page: Page) => section(page, "radar-top").locator("ol > li");
const newsItems = (page: Page) => section(page, "radar-news").locator("ol > li");
const overflows = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
const headings = (page: Page) => main(page).getByRole("heading").allInnerTexts();
const box = async (locator: Locator) => (await locator.boundingBox())!;

/** The pattern of the sections that are not built yet (investments, ventures, alerts, market snapshot). */
const notBuilt = /investment|investasi|alert|peringatan|market snapshot|ringkasan pasar|my ventures|usaha saya|financial advice|nasihat/i;

// ---- A full day ------------------------------------------------------------------------------------

test.describe("a full day", () => {
  let scoresRun: Date;
  test.beforeAll(() => {
    scoresRun = new Date(JSON.parse(runDb("fixtures")).scoresRun);
  });

  for (const locale of ["en", "id"] as const) {
    const c = copy[locale];

    test(`${locale}: the header, then the brief, the top opportunities and the news, in that order and nothing else`, async ({ page, baseURL }) => {
      // Nothing is requested from outside the app.
      const outside: string[] = [];
      page.on("request", (request) => {
        if (!/^(data|blob):/.test(request.url()) && new URL(request.url()).origin !== new URL(baseURL!).origin) outside.push(request.url());
      });

      await page.goto(`/${locale}`);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(c.title);
      await expect(page).toHaveTitle("Radar · Opportunity Radar");
      // Today's date and the time of the last successful morning run, in WIB.
      await expect(main(page).getByText(c.updated(longDate(new Date(), locale), clockOf(scoresRun, locale)), { exact: true })).toBeVisible();
      await expect(page.getByRole("status")).toHaveCount(0); // fresh: no banner

      expect(await headings(page)).toEqual([c.title, c.brief, c.top, c.news]);
      expect(await main(page).innerText()).not.toMatch(notBuilt);
      expect(outside).toEqual([]);
    });

    test(`${locale}: the brief shows each line with its category and sentence in this language, the affected count and the AI source line`, async ({ page }) => {
      await page.goto(`/${locale}`);
      await expect(briefItems(page)).toHaveCount(fixtureBriefLines.length);
      for (const [index, line] of fixtureBriefLines.entries()) {
        const affected = line.opportunities.length > 0 ? ` ${c.affected(line.opportunities.length)}` : "";
        await expect(briefItems(page).nth(index), line.label).toHaveText(`${c.cat[line.label]}: ${c.pick(line)}${affected}`);
        await expect(briefItems(page).nth(index).locator("strong")).toHaveText(`${c.cat[line.label]}:`);
      }
      // Two affected, one affected, none (nothing is said then).
      await expect(briefItems(page).nth(0)).toContainText(c.affected(2));
      await expect(briefItems(page).nth(1)).toContainText(c.affected(1));
      await expect(briefItems(page).nth(2)).not.toContainText(locale === "en" ? "affected" : "terdampak");
      // The other language's sentence is not there.
      await expect(section(page, "radar-brief")).not.toContainText(copy[locale === "en" ? "id" : "en"].pick(fixtureBriefLines[0]));
      const stats = todayStats();
      await expect(section(page, "radar-brief")).toContainText(c.source(stats.articles, stats.sources));
    });

    test(`${locale}: the five best opportunities by score, each with score, title, thesis, region, sector, horizon and its news count`, async ({ page }) => {
      await page.goto(`/${locale}`);
      await expect(topItems(page)).toHaveCount(5);
      for (const [index, f] of top.entries()) {
        const item = topItems(page).nth(index);
        await expect(item, f.key).toContainText(String(f.history.at(-1)![1]));
        await expect(item, f.key).toContainText(c.score);
        await expect(item.getByRole("link"), f.key).toHaveText(c.pick(f.title));
        await expect(item.getByRole("link"), f.key).toHaveAttribute("href", `/${locale}/opportunities/${idOf(f.key)}`);
        await expect(item, f.key).toContainText(c.pick(f.thesis));
        await expect(item.locator("[data-trend]"), f.key).toHaveText(trendOf(locale, f.key));
        await expect(item, f.key).toContainText(c.region[f.region]);
        await expect(item, f.key).toContainText(f.sectors.map((s) => c.sector[s]).join(", "));
        await expect(item, f.key).toContainText(c.horizon[f.horizon]);
        const citations = (f.cites ?? []).length; // every cited source is switched on
        // Nothing is said when no citation is left to count.
        if (citations > 0) await expect(item, f.key).toContainText(c.basedOn(citations));
        else await expect(item, f.key).not.toContainText(/Based on|Berdasarkan/);
      }
      // The order is the Opportunities list's: score first, then id.
      expect(top.map((f) => f.key)).toEqual(["cold-chain", "solar", "assistant", "tax", "climate"]);
      expect(await topItems(page).getByRole("link").allInnerTexts()).toEqual(top.map((f) => c.pick(f.title)));
      // 3, 3, 0, 1 and 0 news items, with the singular form for 1.
      await expect(main(page)).toContainText(c.basedOn(1));
      await expect(section(page, "radar-top").getByRole("link", { name: c.seeAll(openFixtures().length), exact: true })).toHaveAttribute("href", `/${locale}/opportunities`);
    });

    test(`${locale}: the five newest linked articles, once each, with category, headline link, why in this language, source and credit`, async ({ page }) => {
      await page.goto(`/${locale}`);
      await expect(newsItems(page)).toHaveCount(5);
      // Newest first. The sixth cited article (the long one) is not shown; the "off" one is cited by an open opportunity and its source is on.
      const now = new Date();
      for (const [index, e] of linked.entries()) {
        const item = newsItems(page).nth(index);
        const link = item.locator('a[target="_blank"]').first();
        await expect(link, e.key).toContainText(e.headline);
        await expect(link, e.key).toHaveAttribute("href", e.fresh ? /^https:\/\/example\.com\/e2e\// : new RegExp(`^https://example\\.com/e2e/evidence/${e.key}$`));
        await expect(link, e.key).toHaveAttribute("rel", "noopener noreferrer");
        await expect(item, e.key).toContainText(c.cat[e.category]);
        // Age: days up to 6, then the WIB date.
        if (e.fresh) await expect(item, e.key).toContainText(/\d+ ?(m|mnt|menit) (ago|lalu)/);
        else {
          const days = e.ageDays!;
          const then = wib(new Date(now.getTime() - days * 24 * 3600_000));
          await expect(item, e.key).toContainText(days < 7 ? c.ago(days) : `${then.day} ${c.short[then.month]}`);
        }
        await expect(item, e.key).toContainText(e.region === "global" ? "Global" : "Indonesia");
        // The why, in this language, only for an article with an ok triage.
        if (e.why) {
          await expect(item, e.key).toContainText(c.pick(e.why));
          // Labelled, with the AI mark: the text is ours, not the publisher's (screen-reader text and tooltip).
          await expect(item, e.key).toContainText(c.why);
          await expect(item.getByText(c.aiSr), e.key).toHaveCount(1);
          await expect(item.locator(`[title="${c.aiSr}"]`), e.key).toHaveCount(1);
        } else {
          await expect(item.getByText(c.aiSr), e.key).toHaveCount(0);
        }
        // Open opportunities that cite it (closed ones are not counted), plain text, shown before the credit line.
        const open = fixtureOpportunities.filter((o) => !o.closedDaysAgo && (o.cites ?? []).includes(e.key)).length;
        await expect(item.getByText(/^(Linked to|Terkait) \d+/), e.key).toHaveCount(open > 0 ? 1 : 0);
        if (open > 0) await expect(item.getByText(c.linkedTo(open), { exact: true }), e.key).toBeVisible();
        // Paragraphs: the why, the linked count, then the credit line (licensed sources only).
        const paragraphs = (e.why ? 1 : 0) + (open > 0 ? 1 : 0) + (e.key === "conversation" ? 1 : 0);
        await expect(item.locator("p"), e.key).toHaveCount(paragraphs);
      }
      await expect(main(page)).not.toContainText(longEvidenceHeadline);
      // Untriaged: no why and no placeholder.
      await expect(newsItems(page).nth(2)).toContainText(headlines.coldChain);
      await expect(newsItems(page).nth(2)).not.toContainText(/why|mengapa/i);
      // Credit lines of the licensed sources, the licence as a link to its deed.
      await expect(newsItems(page).nth(4).locator("p").last()).toHaveText(c.credit.conversation);
      await expect(newsItems(page).nth(4).getByRole("link", { name: "CC BY-ND 4.0" })).toHaveAttribute("href", "https://creativecommons.org/licenses/by-nd/4.0/");
      // Items without a licence carry no credit line.
      await expect(newsItems(page).nth(0).getByText(/^(Source|Sumber):/)).toHaveCount(0);
      await expect(section(page, "radar-news").getByRole("link", { name: c.allNews, exact: true })).toHaveAttribute("href", `/${locale}/news`);
    });

    test(`${locale}: brief lines, titles, theses, headlines and why show as text and nothing executes`, async ({ page }) => {
      await page.goto(`/${locale}`);
      await expect(briefItems(page).nth(1)).toContainText(briefInjection);
      // (The News list and the opportunity evidence cover markup in headlines and why texts.)
      await expect(briefItems(page).locator("script, b")).toHaveCount(0);
      expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
    });

    test(`${locale}: the links work: an opportunity opens its detail, "See all" the list, "All news" the news`, async ({ page }) => {
      await page.goto(`/${locale}`);
      // A click anywhere on the card, not only on the title, opens the detail.
      // (Playwright's click refuses a target covered by the stretched link, so the mouse is used.)
      const thesis = await box(topItems(page).first().getByText(c.pick(top[0].thesis)));
      await page.mouse.click(thesis.x + thesis.width / 2, thesis.y + thesis.height / 2);
      await expect(page).toHaveURL(`/${locale}/opportunities/${idOf("cold-chain")}`);
      await expect(page.getByRole("heading", { level: 2, name: c.pick(top[0].title) })).toBeVisible();

      await page.goto(`/${locale}`);
      await section(page, "radar-top").getByRole("link", { name: c.seeAll(openFixtures().length), exact: true }).click();
      await expect(page).toHaveURL(`/${locale}/opportunities`);

      await page.goto(`/${locale}`);
      await section(page, "radar-news").getByRole("link", { name: c.allNews, exact: true }).click();
      await expect(page).toHaveURL(`/${locale}/news`);
    });
  }

  test("one column in the order brief, top opportunities, news; no sideways scroll even with very long texts; links are 44 px tall", async ({ page }) => {
    await page.goto("/en");
    const y = async (id: string) => (await box(section(page, id))).y;
    expect(await y("radar-brief")).toBeLessThan(await y("radar-top"));
    expect(await y("radar-top")).toBeLessThan(await y("radar-news"));
    // One column: every section spans the same width.
    const widths = await Promise.all(["radar-brief", "radar-top", "radar-news"].map(async (id) => (await box(section(page, id))).width));
    expect(new Set(widths.map(Math.round)).size).toBe(1);
    expect(await overflows(page)).toBe(false);

    // Tap targets: the section links, the headline links and each opportunity card are at least 44 px tall.
    const links = [
      section(page, "radar-top").getByRole("link", { name: copy.en.seeAll(openFixtures().length), exact: true }),
      section(page, "radar-news").getByRole("link", { name: copy.en.allNews, exact: true }),
      ...(await newsItems(page).all()).map((item) => item.locator('a[target="_blank"]').first()),
    ];
    for (const link of links) expect((await box(link)).height).toBeGreaterThanOrEqual(44);
    // The licence link of the credit line too, and it does not make the line taller.
    const licence = section(page, "radar-news").getByRole("link", { name: "CC BY-ND 4.0" });
    expect((await box(licence)).height).toBeGreaterThanOrEqual(44);
    expect((await box(licence.locator(".."))).height).toBeLessThan(20);
    for (const item of await topItems(page).all()) expect((await box(item)).height).toBeGreaterThanOrEqual(44);

    // The same page with a 204-character word added to every text.
    await page.evaluate(() => {
      const word = "Superpanjang".repeat(17);
      const top = "section[aria-labelledby=radar-top] ol > li";
      const news = "section[aria-labelledby=radar-news] ol > li";
      const targets = [
        "section[aria-labelledby=radar-brief] ol > li",
        `${top} div.flex-1 > p, ${top} div.flex-1 > a, ${top} div.flex-1 span`,
        `${news} a[target=_blank] > span, ${news} p, ${news} > div > span`,
      ];
      for (const target of targets) document.querySelectorAll(target).forEach((element) => element.append(word));
    });
    expect(await overflows(page), "a long text scrolls the page sideways").toBe(false);
  });
});

// ---- Other states ----------------------------------------------------------------------------------

for (const locale of ["en", "id"] as const) {
  const c = copy[locale];

  test(`${locale}: without a brief for today a muted card says so, and the other sections stay`, async ({ page }) => {
    try {
      runDb("fixtures", "--no-brief");
      await page.goto(`/${locale}`);
      await expect(section(page, "radar-brief")).toContainText(c.briefNone);
      await expect(briefItems(page)).toHaveCount(0);
      await expect(section(page, "radar-brief")).not.toContainText(/AI summary|Ringkasan AI dari/);
      await expect(topItems(page)).toHaveCount(5);
      await expect(newsItems(page)).toHaveCount(5);
    } finally {
      resetFixtures();
    }
  });

  test(`${locale}: an old brief is not shown as today's`, async ({ page }) => {
    try {
      // Only the brief of today's WIB day counts: this one is yesterday's.
      runDb("fixtures", "--brief-day=-1");
      await page.goto(`/${locale}`);
      await expect(section(page, "radar-brief")).toContainText(c.briefNone);
    } finally {
      resetFixtures();
    }
  });

  test(`${locale}: without opportunities the card says the first morning run is at 07:00, with no "See all" and no news section`, async ({ page }) => {
    try {
      runDb("fixtures", "--no-opportunities");
      await page.goto(`/${locale}`);
      await expect(section(page, "radar-top")).toContainText(c.topEmpty);
      await expect(topItems(page)).toHaveCount(0);
      await expect(main(page).getByRole("link", { name: /See all|Lihat semua/ })).toHaveCount(0);
      // No linked news: the section is left out with no placeholder.
      await expect(section(page, "radar-news")).toHaveCount(0);
      expect(await headings(page)).toEqual([c.title, c.brief, c.top]);
      await expect(briefItems(page)).toHaveCount(3);
      await expect(briefItems(page).first()).not.toContainText(locale === "en" ? "affected" : "terdampak");
    } finally {
      resetFixtures();
    }
  });

  test(`${locale}: a section whose run is more than 26 hours old says so, with its own name, WIB date and time; 25 hours does not`, async ({ page }) => {
    try {
      runDb("fixtures", `--scores-run=${25 * 60}`, `--brief-run=${25 * 60}`);
      await page.goto(`/${locale}`);
      await expect(topItems(page)).toHaveCount(5);
      await expect(page.getByRole("status")).toHaveCount(0);

      // Opportunities only: the line sits in that section.
      const { scoresRun } = JSON.parse(runDb("fixtures", `--scores-run=${27 * 60}`));
      const then = wib(new Date(scoresRun));
      const when = `${then.day} ${c.short[then.month]}, ${clockOf(new Date(scoresRun), locale)}`;
      await page.goto(`/${locale}`);
      await expect(page.getByRole("status")).toHaveCount(1);
      await expect(section(page, "radar-top").getByRole("status")).toHaveText(c.stale(when));
      // The stored content is still shown, and the header names the same time.
      await expect(topItems(page)).toHaveCount(5);
      await expect(briefItems(page)).toHaveCount(3);
      await expect(main(page).getByText(c.updated(longDate(new Date(scoresRun), locale), clockOf(new Date(scoresRun), locale)), { exact: true })).toBeVisible();

      // Both at once, each in its own section.
      const both = JSON.parse(runDb("fixtures", `--scores-run=${27 * 60}`, `--brief-run=${30 * 60}`));
      const briefThen = wib(new Date(both.briefRun));
      await page.goto(`/${locale}`);
      await expect(page.getByRole("status")).toHaveCount(2);
      await expect(section(page, "radar-brief").getByRole("status")).toHaveText(
        c.staleBrief(`${briefThen.day} ${c.short[briefThen.month]}, ${clockOf(new Date(both.briefRun), locale)}`),
      );
      const bothThen = wib(new Date(both.scoresRun));
      await expect(section(page, "radar-top").getByRole("status")).toHaveText(
        c.stale(`${bothThen.day} ${c.short[bothThen.month]}, ${clockOf(new Date(both.scoresRun), locale)}`),
      );
    } finally {
      resetFixtures();
    }
  });

  test(`${locale}: before anything has run one card replaces the brief; the other sections keep their own empty texts`, async ({ page }) => {
    try {
      runDb("fixtures", "--last-run=never", "--scores-run=never", "--brief-run=never", "--no-opportunities", "--no-articles", "--no-brief");
      await page.goto(`/${locale}`);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(c.title);
      // The card, then Top opportunities with its empty text; no brief, no news, no banner, nothing about investments.
      expect(await headings(page)).toEqual([c.title, c.never[0], c.top]);
      await expect(section(page, "radar-never")).toContainText(c.never[1]);
      await expect(section(page, "radar-top")).toContainText(c.topEmpty);
      await expect(section(page, "radar-brief")).toHaveCount(0);
      await expect(section(page, "radar-news")).toHaveCount(0);
      await expect(page.getByRole("status")).toHaveCount(0);
    } finally {
      resetFixtures();
    }
  });
}

// ---- Loading ---------------------------------------------------------------------------------------

test("the screen has a loading state: while the data loads, the skeleton is on screen", async ({ page }) => {
  await expectSkeletonOnNavigation(page, {
    from: "/en/news",
    link: "Radar",
    target: /\/en\?_rsc=/,
    loaded: () => page.getByRole("heading", { level: 1, name: copy.en.title }),
  });
});

// ---- Store unreachable -----------------------------------------------------------------------------

// As in e2e/news.spec.ts: the table the page reads is renamed away in the test's own e2e database
// and back, so no second server is needed.
test.describe("store unreachable", () => {
  for (const locale of ["en", "id"] as const) {
    test(`${locale}: the error state shows no host, port, password or stack trace, and retry works`, async ({ page }) => {
      const c = copy[locale];
      const url = `/${locale}`;

      await page.goto(url);
      await expect(topItems(page).first()).toBeVisible();

      try {
        runDb("break", "opportunities");
        await page.goto(url);
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(c.title);
        await expect(main(page)).toContainText(c.error[0]);
        const retry = page.getByRole("link", { name: c.error[1], exact: true });
        await expect(retry).toHaveAttribute("href", url);
        await expect(topItems(page)).toHaveCount(0);
        await expect(page.getByRole("banner").getByRole("navigation")).toBeVisible();

        const db = new URL(e2eDatabaseUrl());
        const html = await page.content();
        for (const detail of [db.hostname, db.port, db.pathname.slice(1), "postgres://", "postgres", 'relation "', "42P01", "__off", "ECONNREFUSED", "Failed query", "params:", "digest", "node_modules", "    at "]) {
          expect(html, `the page leaks "${detail}"`).not.toContain(detail);
        }

        // The store is still down, so the retry link brings the same state back.
        await retry.click();
        await expect(main(page)).toContainText(c.error[0]);
      } finally {
        runDb("restore", "opportunities");
      }

      await page.goto(url);
      await expect(topItems(page).first()).toBeVisible();
      await expect(main(page)).not.toContainText(c.error[0]);
    });
  }
});
