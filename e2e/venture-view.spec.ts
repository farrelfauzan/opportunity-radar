import type { Locator, Page } from "@playwright/test";
import { e2eDatabaseUrl } from "../scripts/e2e-env";
import { resetFixtures, runDb } from "./db";
import { expect, test } from "./fixtures";
import { fixtureArticles, headlines } from "./news-fixtures";
import { fixtureVentures, relatedCount, scoreSeries, ventureInjection } from "./venture-fixtures";

const copy = {
  en: {
    back: "← Radar",
    progress: { title: "Build progress", mvp: "Progress to MVP", release: "Progress to next release", source: /^From Notion · updated \d{2}:\d{2} WIB$/ },
    sentence: { performa: "Sprint 3 delivered · Next: sprint 4 · 4 tickets in QA", pasar: "Next: sprint 2 · 1 ticket in QA" },
    notConnected: ["Progress source not connected", "Connect this venture's project board to show build progress."],
    market: { title: "Market view from the news", subtitle: "AI-scored every morning from the news of the last 30 days", score: "score / 100" },
    oppId: "Opportunity · Indonesia",
    oppWorld: "Opportunity · Worldwide",
    factors: ["Demand", "Timing", "Low competition", "Capital efficiency", "Low regulatory risk"],
    vs: (change: string) => `${change} vs yesterday`,
    spoken: { up: "up 5 points vs yesterday", down: "down 2 points vs yesterday", flat: "unchanged vs yesterday" },
    out: (score: number) => `${score} out of 100`,
    trend: (n: number, first: number, last: number) => `Last ${n} days: from ${first} to ${last}`,
    trend30: "Score, 30 days",
    noScore: "No score yet: no related news in the last 30 days",
    winds: { title: "What helps and what hurts", evidence: "Evidence", tailwind: "Tailwind", headwind: "Headwind" },
    news: { title: "Related news, 30 days", empty: "No related news in the last 30 days", loadMore: "Load more", why: "Why it matters", ai: "AI", aiSr: "Written by AI from the article, not by the publisher" },
    impact: { opportunity: "Opportunity", risk: "Risk", context: "Context" },
    cat: { business: "Business", politics: "Politics & policy", "tech-ai": "Tech & AI", markets: "Markets", commodities: "Commodities" },
    credit: "Source: The Conversation Indonesia · CC BY-ND 4.0",
    never: ["No data yet", "The first update runs at 07:00 WIB."],
    staleLine: "Venture data last updated",
    error: ["Can't load this right now", "Try again"],
    notFound: ["Page not found", "This page does not exist."],
    open: (n: number) => `Open venture view · ${n} related news ${n === 1 ? "item" : "items"}`,
    asOf: "As of",
    short: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
    pick: (pair: { en: string; id: string }) => pair.en,
    other: (pair: { en: string; id: string }) => pair.id,
  },
  id: {
    back: "← Radar",
    progress: { title: "Progres pengembangan", mvp: "Progres menuju MVP", release: "Progres menuju rilis berikutnya", source: /^Dari Notion · diperbarui \d{2}\.\d{2} WIB$/ },
    sentence: { performa: "Sprint 3 selesai · Berikutnya: sprint 4 · 4 tiket di QA", pasar: "Berikutnya: sprint 2 · 1 tiket di QA" },
    notConnected: ["Sumber progres belum terhubung", "Hubungkan papan proyek usaha ini untuk menampilkan progres pengembangan."],
    market: { title: "Pandangan pasar dari berita", subtitle: "Dinilai AI setiap pagi dari berita 30 hari terakhir", score: "skor / 100" },
    oppId: "Peluang · Indonesia",
    oppWorld: "Peluang · Dunia",
    factors: ["Permintaan", "Waktu", "Persaingan rendah", "Efisiensi modal", "Risiko regulasi rendah"],
    vs: (change: string) => `${change} dibanding kemarin`,
    spoken: { up: "naik 5 poin dibanding kemarin", down: "turun 2 poin dibanding kemarin", flat: "tidak berubah dibanding kemarin" },
    out: (score: number) => `${score} dari 100`,
    trend: (n: number, first: number, last: number) => `${n} hari terakhir: dari ${first} ke ${last}`,
    trend30: "Skor, 30 hari",
    noScore: "Belum ada skor: tidak ada berita terkait dalam 30 hari terakhir",
    winds: { title: "Apa yang membantu dan menghambat", evidence: "Bukti", tailwind: "Pendorong", headwind: "Penghambat" },
    news: { title: "Berita terkait, 30 hari", empty: "Tidak ada berita terkait dalam 30 hari terakhir", loadMore: "Muat lebih banyak", why: "Mengapa penting", ai: "AI", aiSr: "Ditulis oleh AI dari artikel, bukan oleh penerbit" },
    impact: { opportunity: "Peluang", risk: "Risiko", context: "Konteks" },
    cat: { business: "Bisnis", politics: "Politik & kebijakan", "tech-ai": "Teknologi & AI", markets: "Pasar", commodities: "Komoditas" },
    credit: "Sumber: The Conversation Indonesia · CC BY-ND 4.0",
    never: ["Belum ada data", "Pembaruan pertama berjalan pukul 07.00 WIB."],
    staleLine: "Data usaha terakhir diperbarui",
    error: ["Tidak dapat memuat sekarang", "Coba lagi"],
    notFound: ["Halaman tidak ditemukan", "Halaman ini tidak ada."],
    open: (n: number) => `Buka tampilan usaha · ${n} berita terkait`,
    asOf: "Per",
    short: ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"],
    pick: (pair: { en: string; id: string }) => pair.id,
    other: (pair: { en: string; id: string }) => pair.en,
  },
} as const;

const [performa, meta, pasar] = fixtureVentures;
const articles = fixtureArticles();
/** A News fixture article by its key (the ones the venture fixtures match or cite). */
const keyed = (key: string) => articles.find((a) => a.key === key)!;
const okTriage = (key: string) => {
  const triage = keyed(key).triage;
  if (triage?.status !== "ok") throw new Error(`${key} has no ok triage`);
  return triage;
};

const main = (page: Page) => page.locator("main");
const section = (page: Page, id: string) => main(page).locator(`section[aria-labelledby="venture-${id}"]`);
const region = (page: Page, name: "indonesia" | "global") => section(page, "market").locator(`[data-venture-score="${name}"]`);
const wind = (page: Page, kind: "tailwind" | "headwind") => section(page, "winds").locator(`[data-wind="${kind}"]`);
const newsItems = (page: Page) => section(page, "news").locator("ol > li");
const newsItem = (page: Page, headline: string) => newsItems(page).filter({ hasText: headline });
const url = (locale: string, v: { slug: string }, query = "") => `/${locale}/ventures/${v.slug}${query}`;
const overflows = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
const box = async (locator: Locator) => (await locator.boundingBox())!;
const wide = (page: Page) => (page.viewportSize()?.width ?? 0) >= 1024;

for (const locale of ["en", "id"] as const) {
  const c = copy[locale];

  test.describe(`${locale}: venture view`, () => {
    test.beforeAll(() => {
      resetFixtures();
    });

    test("both v1 ventures: name and one-line description in this language, a back link to the Radar, Radar current in the nav", async ({ page }) => {
      for (const v of [performa, meta]) {
        const response = await page.goto(url(locale, v));
        expect(response?.status()).toBe(200);
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(v.name);
        await expect(main(page)).toContainText(c.pick(v.description));
        await expect(main(page)).not.toContainText(c.other(v.description));
        await expect(page).toHaveTitle(`Radar · Opportunity Radar`);
        const back = main(page).getByRole("link", { name: c.back, exact: true });
        await expect(back).toHaveAttribute("href", `/${locale}`);
        expect((await box(back)).height).toBeGreaterThanOrEqual(44);
        const current = page.getByRole("banner").locator('[aria-current="page"]');
        await expect(current).toHaveCount(1);
        await expect(current).toHaveText("Radar");
        await expect(current).toHaveAttribute("href", `/${locale}`);
      }
      await page.getByRole("link", { name: c.back, exact: true }).click();
      await expect(page).toHaveURL(`/${locale}`);
    });

    test("blocks come in the spec's order: progress, market view, then winds and related news", async ({ page }) => {
      await page.goto(url(locale, performa));
      const order = await main(page).evaluate((element) => [...element.querySelectorAll("section")].map((s) => s.getAttribute("aria-labelledby")));
      // (The evidence lists inside the winds are sections of their own.)
      expect(order.filter((id) => !id?.endsWith("-evidence"))).toEqual(["venture-progress", "venture-market", "venture-winds", "venture-news"]);
      // No "Model this in the calculator" action yet (OR-40 prefill for ventures comes later).
      await expect(main(page).getByRole("link", { name: /calculator|kalkulator/i })).toHaveCount(0);
    });

    test("progress: bar with the percent, the progress sentence, and the source with its time", async ({ page }) => {
      await page.goto(url(locale, performa));
      const card = section(page, "progress");
      await expect(card.getByRole("heading", { level: 2 })).toHaveText(c.progress.title);
      const bar = card.getByRole("progressbar", { name: c.progress.mvp });
      await expect(bar).toHaveAttribute("aria-valuenow", "62");
      await expect(card).toContainText("62%");
      expect((await box(bar.locator("span"))).width / (await box(bar)).width).toBeCloseTo(0.62, 1);
      await expect(card).toContainText(c.sentence.performa);
      await expect(card.getByText(c.progress.source)).toBeVisible();
    });

    test("progress: parts without data are left out of the sentence, and a connected venture's goal label follows its goal", async ({ page }) => {
      await page.goto(url(locale, pasar));
      const card = section(page, "progress");
      await expect(card.getByRole("progressbar", { name: c.progress.release })).toHaveAttribute("aria-valuenow", "20");
      await expect(card).toContainText(c.sentence.pasar);
      await expect(card).not.toContainText(/Sprint \d+ (delivered|selesai)/);
    });

    test("progress not connected: says so with its explanation, and the market view still renders", async ({ page }) => {
      await page.goto(url(locale, meta));
      const card = section(page, "progress");
      await expect(card).toContainText(c.notConnected[0]);
      await expect(card).toContainText(c.notConnected[1]);
      await expect(card.getByRole("progressbar")).toHaveCount(0);
      await expect(card).not.toContainText(/%|Sprint/);
      await expect(region(page, "indonesia")).toContainText("81");
      await expect(section(page, "winds")).toBeVisible();
    });

    test("market: Indonesia and Worldwide, each with the score out of 100, the change vs yesterday, five factor bars with numbers", async ({ page }) => {
      await page.goto(url(locale, performa));
      const market = section(page, "market");
      await expect(market.getByRole("heading", { level: 2 })).toHaveText(c.market.title);
      await expect(market).toContainText(c.market.subtitle);
      await expect(market.getByRole("heading", { level: 3 })).toHaveText([c.oppId, c.oppWorld]);

      for (const [name, score, change, direction, spoken] of [
        ["indonesia", 76, "▲ 5", "up", c.spoken.up],
        ["global", 68, "▼ 2", "down", c.spoken.down],
      ] as const) {
        const card = region(page, name);
        await expect(card).toContainText(String(score));
        await expect(card).toContainText(c.market.score);
        // The symbol and number are for the eye; the screen reader gets the sentence in points.
        const visible = card.locator(`[data-trend="${direction}"]`);
        await expect(visible).toHaveText(c.vs(change));
        await expect(visible).toHaveAttribute("aria-hidden", "true");
        await expect(card.locator(".sr-only", { hasText: spoken })).toHaveCount(1);
        await expect(card.locator(".sr-only", { hasText: c.out(score) })).toHaveCount(1);
        await expect(card.locator("[data-score-asof]")).toHaveCount(0); // today's score
        const rows = card.getByRole("listitem");
        await expect(rows).toHaveCount(5);
        for (const [index, label] of c.factors.entries()) {
          await expect(rows.nth(index)).toContainText(label);
          await expect(rows.nth(index)).toContainText(String(score)); // the fixture's factors all equal the overall score
          await expect(card.getByRole("meter", { name: label })).toHaveAttribute("aria-valuenow", String(score));
        }
      }
    });

    test("market: unchanged shows — 0, a region without a score says so (no invented number, no bars, no line)", async ({ page }) => {
      await page.goto(url(locale, meta));
      const id = region(page, "indonesia");
      await expect(id.locator("[data-trend]")).toHaveText(c.vs("— 0"));
      await expect(id.locator(".sr-only", { hasText: c.spoken.flat })).toHaveCount(1);
      const world = region(page, "global");
      await expect(world).toContainText(c.noScore);
      await expect(world.locator("[data-trend]")).toHaveCount(0);
      await expect(world.getByRole("meter")).toHaveCount(0);
      await expect(world.locator("[data-venture-line]")).toHaveCount(0);
      await expect(world).not.toContainText(c.market.score);
    });

    test("market: no change is shown for a score without a row for yesterday", async ({ page }) => {
      await page.goto(url(locale, pasar));
      await expect(region(page, "indonesia")).toContainText("55");
      await expect(region(page, "indonesia").locator("[data-trend]")).toHaveCount(0);
    });

    test("market: the 30-day line is aria-hidden and has a text summary with the real number of days drawn, gaps included", async ({ page }) => {
      for (const [v, name] of [[performa, "indonesia"], [performa, "global"], [meta, "indonesia"]] as const) {
        await page.goto(url(locale, v));
        const series = scoreSeries(v, name);
        const line = region(page, name).locator("[data-venture-line]");
        await expect(line).toContainText(c.trend30);
        await expect(line.locator("svg")).toHaveAttribute("aria-hidden", "true");
        await expect(line.locator("svg polyline")).toHaveAttribute("points", /^\d+(\.\d)?,\d+(\.\d)? .+/);
        expect((await line.locator("svg polyline").getAttribute("points"))!.split(" ")).toHaveLength(series.length);
        await expect(line.locator(".sr-only")).toHaveText(c.trend(series.length, series[0][1], series[series.length - 1][1]));
      }
      // Performa's Indonesia: 28 older days, three of them gaps, plus yesterday and today.
      expect(scoreSeries(performa, "indonesia")).toHaveLength(27);
    });

    test("market: a score that is not from today or yesterday shows its day; the line still draws what is there", async ({ page }) => {
      try {
        runDb("fixtures", "--venture-market-age=9");
        await page.goto(url(locale, performa));
        const asOf = region(page, "indonesia").locator("[data-score-asof]");
        await expect(asOf).toHaveText(new RegExp(`^${c.asOf} \\d{1,2} (${c.short.join("|")})$`));
        await expect(region(page, "global").locator("[data-score-asof]")).toHaveCount(1);
        await expect(region(page, "indonesia").locator("[data-venture-line]")).toBeVisible();
      } finally {
        resetFixtures();
      }
    });

    test("winds: one tailwind and one headwind per venture, each with its cited articles: a link to the publisher in a new tab", async ({ page }) => {
      await page.goto(url(locale, performa));
      await expect(section(page, "winds").getByRole("heading", { level: 2 })).toHaveText(c.winds.title);
      await expect(section(page, "winds").locator("[data-wind]")).toHaveCount(2);
      await expect(wind(page, "tailwind")).toContainText(`${c.winds.tailwind} · ${c.pick(performa.winds.tailwind!)}`);
      await expect(wind(page, "headwind")).toContainText(`${c.winds.headwind} · ${c.pick(performa.winds.headwind!)}`);
      await expect(wind(page, "tailwind")).not.toContainText(c.other(performa.winds.tailwind!));

      // The tailwind cites the first stored article and the licensed one, newest first; the headwind the tariff article.
      const tail = wind(page, "tailwind").getByRole("link");
      await expect(wind(page, "tailwind").getByRole("heading", { level: 3 })).toHaveText(c.winds.evidence);
      await expect(tail).toHaveCount(2 + 1); // two headlines and the licence link
      const first = tail.filter({ hasText: headlines.newest });
      await expect(first).toHaveAttribute("href", /^https:\/\/example\.com\/e2e\//);
      await expect(first).toHaveAttribute("target", "_blank");
      await expect(first).toHaveAttribute("rel", "noopener noreferrer");
      const items = wind(page, "tailwind").locator("li");
      await expect(items.first()).toContainText(headlines.newest);
      await expect(items.nth(1)).toContainText(headlines.conversation);
            await expect(wind(page, "headwind").getByRole("link", { name: new RegExp(headlines.tariff.slice(0, 20)) })).toHaveAttribute("target", "_blank");
      // Source and time of an item.
      await expect(items.first()).toContainText(/TechCrunch · \S+/);
    });

    test("winds: the credit line shows for a licensed source's article, with the licence link; other articles carry none", async ({ page }) => {
      await page.goto(url(locale, performa));
      const items = wind(page, "tailwind").locator("li");
      await expect(items.nth(1)).toContainText(c.credit);
      const licence = items.nth(1).getByRole("link", { name: "CC BY-ND 4.0" });
      await expect(licence).toHaveAttribute("href", "https://creativecommons.org/licenses/by-nd/4.0/");
      await expect(licence).toHaveAttribute("target", "_blank");
      await expect(items.first()).not.toContainText(/Source:|Sumber:/);
    });

    test("winds: a cited article of a switched-off source is hidden; the sentence stays, the others still show", async ({ page }) => {
      try {
        runDb("deactivate", "conversation-id");
        await page.goto(url(locale, performa));
        await expect(wind(page, "tailwind").locator("li")).toHaveCount(1);
        await expect(wind(page, "tailwind")).toContainText(headlines.newest);
        await expect(wind(page, "tailwind")).not.toContainText(headlines.conversation);
        await expect(wind(page, "tailwind")).toContainText(c.pick(performa.winds.tailwind!));
        // A wind whose every cited article is hidden keeps its sentence and shows no evidence.
        await page.goto(url(locale, pasar));
        await expect(wind(page, "tailwind")).toContainText(c.pick(pasar.winds.tailwind!));
        await expect(wind(page, "tailwind").getByRole("link")).toHaveCount(0);
        await expect(wind(page, "tailwind").getByRole("heading")).toHaveCount(0);
        await expect(wind(page, "headwind").getByRole("link")).toHaveCount(1);
        // ... and the licensed article is not in the related news either, nor in its count.
        await expect(section(page, "news")).not.toContainText(headlines.conversation);
        await expect(newsItems(page)).toHaveCount(20);
      } finally {
        resetFixtures();
      }
    });

    test("related news: newest first, with category and headline link; no why or impact for an article that was not triaged", async ({ page }) => {
      await page.goto(url(locale, performa));
      await expect(section(page, "news").getByRole("heading", { level: 2 })).toHaveText(c.news.title);
      expect(relatedCount(performa)).toBe(2);
      await expect(newsItems(page)).toHaveCount(2); // the match rated 49 is not listed
      await expect(newsItems(page).first()).toContainText(headlines.newest);
      await expect(newsItems(page).nth(1)).toContainText("AI infrastructure update 1");
      await expect(newsItems(page).first()).toContainText(c.cat["tech-ai"]);
      await expect(newsItems(page).first()).toContainText(/TechCrunch · .+ · Global/);
      const link = newsItems(page).first().getByRole("link", { name: new RegExp(headlines.newest) });
      await expect(link).toHaveAttribute("target", "_blank");
      await expect(link).toHaveAttribute("rel", "noopener noreferrer");
      await expect(newsItems(page).first()).not.toContainText(c.news.why);
      for (const word of Object.values(c.impact)) await expect(newsItems(page).first()).not.toContainText(word);
      await expect(section(page, "news").getByRole("link", { name: c.news.loadMore })).toHaveCount(0);
    });

    test("related news: why it matters with the AI mark in this language, the impact word, the AI's category, the credit line", async ({ page }) => {
      await page.goto(url(locale, pasar));
      const tariff = okTriage("tariff");
      const item = newsItem(page, headlines.tariff);
      await expect(item).toContainText(c.cat[tariff.category]);
      await expect(item).toContainText(c.impact[tariff.impact]);
      await expect(item).toContainText(`${c.news.why}AI`);
      await expect(item).toContainText(locale === "en" ? tariff.whyEn : tariff.whyId);
      await expect(item).not.toContainText(locale === "en" ? tariff.whyId : tariff.whyEn);
      await expect(item.locator(".sr-only", { hasText: c.news.aiSr })).toHaveCount(1);
      await expect(item).toContainText(/BBC Business · .+ · Global/);
      await expect(item.getByText(c.credit)).toHaveCount(0);
      // Risk and context words, and an article whose triage failed (feed category, nothing else).
      await expect(newsItem(page, headlines.rupiah)).toContainText(c.impact.risk);
      const failed = newsItem(page, headlines.failed);
      await expect(failed).toContainText(c.cat.business);
      await expect(failed).not.toContainText(c.news.why);
      for (const word of Object.values(c.impact)) await expect(failed).not.toContainText(word);
      // The licensed source's item.
      const licensed = newsItem(page, headlines.conversation);
      await expect(licensed).toContainText(c.impact.context);
      await expect(licensed).toContainText(c.credit);
      await expect(licensed.getByRole("link", { name: "CC BY-ND 4.0" })).toHaveAttribute("href", "https://creativecommons.org/licenses/by-nd/4.0/");
    });

    test("related news: 20 at a time with Load more, newest first, until the rest is shown", async ({ page }) => {
      expect(relatedCount(pasar)).toBe(28);
      await page.goto(url(locale, pasar));
      await expect(newsItems(page)).toHaveCount(20);
      // The keyed articles of today first (newest first), then the filler, newest first.
      const headlinesOf = async () => newsItems(page).evaluateAll((items) => items.map((i) => i.querySelector("a")?.textContent ?? ""));
      const first = await headlinesOf();
      expect(first.slice(0, 6).map((h) => h.replace(/\s*\(.*\)$/, "").trim())).toEqual(
        [headlines.tariff, headlines.rupiah, headlines.coldChain, headlines.failed, headlines.markup, headlines.conversation].map((h) => h.trim()),
      );
      expect(first[6]).toContain("Berita pasar 01");
      expect(first[19]).toContain("Berita pasar 14");
      await expect(newsItem(page, "Berita pasar 15")).toHaveCount(0);

      const more = section(page, "news").getByRole("link", { name: c.news.loadMore, exact: true });
      expect((await box(more)).height).toBeGreaterThanOrEqual(44);
      await more.click();
      await expect(page).toHaveURL(url(locale, pasar, "?shown=40"));
      await expect(newsItems(page)).toHaveCount(28);
      await expect(newsItems(page).last()).toContainText("Berita pasar 22");
      await expect(newsItem(page, "Berita pasar 23")).toHaveCount(0); // the one rated 49
      await expect(section(page, "news").getByRole("link", { name: c.news.loadMore })).toHaveCount(0);
      // ?shown= reloads to the same list.
      await page.reload();
      await expect(newsItems(page)).toHaveCount(28);
    });

    test("related news: none says so (a venture with only a match rated below 50)", async ({ page }) => {
      await page.goto(url(locale, meta));
      await expect(section(page, "news")).toContainText(c.news.empty);
      await expect(newsItems(page)).toHaveCount(0);
      await expect(section(page, "news")).not.toContainText(c.never[0]);
    });

    test("never scored: the market cards, the winds and the related news each say there is no data yet, with the first update time", async ({ page }) => {
      try {
        runDb("fixtures", "--no-venture-market");
        await page.goto(url(locale, performa));
        await expect(main(page).locator("[data-venture-never]")).toHaveCount(3);
        for (const id of ["market", "winds", "news"]) {
          await expect(section(page, id)).toContainText(c.never[0]);
          await expect(section(page, id)).toContainText(c.never[1]);
        }
        await expect(main(page).locator("[data-venture-score]")).toHaveCount(0);
        await expect(main(page).locator("[data-wind]")).toHaveCount(0);
        await expect(newsItems(page)).toHaveCount(0);
        await expect(main(page)).not.toContainText(c.news.empty);
        await expect(main(page)).not.toContainText(c.noScore);
        // The progress is independent of the market view.
        await expect(section(page, "progress").getByRole("progressbar")).toHaveCount(1);
        await page.goto(url(locale, meta));
        await expect(section(page, "progress")).toContainText(c.notConnected[0]);
        await expect(section(page, "market")).toContainText(c.never[0]);
      } finally {
        resetFixtures();
      }
    });

    test("a ventures run more than 26 hours old says so once, with its date and time; 25 hours does not", async ({ page }) => {
      try {
        runDb("fixtures", `--ventures-run=${25 * 60}`);
        await page.goto(url(locale, performa));
        await expect(section(page, "progress")).toBeVisible();
        await expect(page.getByRole("status")).toHaveCount(0);

        runDb("fixtures", `--ventures-run=${27 * 60}`);
        await page.goto(url(locale, performa));
        await expect(page.getByRole("status")).toHaveCount(1);
        await expect(page.getByRole("status")).toContainText(c.staleLine);
        await expect(page.getByRole("status")).toContainText(/\d{1,2} (\w{3}), \d{2}[:.]\d{2} WIB/);
        // The stored content is still shown.
        await expect(region(page, "indonesia")).toContainText("76");
      } finally {
        resetFixtures();
      }
    });
  });

  test.describe(`${locale}: venture view, store unreachable`, () => {
    test("the error state shows no host, port, password or stack trace, and retry goes to the same URL", async ({ page }) => {
      const target = url(locale, performa, "?shown=40");
      await page.goto(target);
      await expect(section(page, "progress")).toBeVisible();
      try {
        runDb("break", "articles");
        await page.goto(target);
        await expect(main(page)).toContainText(c.error[0]);
        const retry = page.getByRole("link", { name: c.error[1], exact: true });
        await expect(retry).toHaveAttribute("href", target);
        await expect(main(page).getByRole("link", { name: c.back, exact: true })).toBeVisible();
        await expect(page.getByRole("banner").getByRole("navigation")).toBeVisible();
        await expect(main(page).locator("section")).toHaveCount(0);

        const db = new URL(e2eDatabaseUrl());
        const html = await page.content();
        for (const detail of [db.hostname, db.port, db.pathname.slice(1), "postgres://", "postgres", 'relation "', "42P01", "__off", "ECONNREFUSED", "Failed query", "params:", "digest", "node_modules", "    at "]) {
          expect(html, `the page leaks "${detail}"`).not.toContain(detail);
        }
        await retry.click();
        await expect(page).toHaveURL(target);
        await expect(main(page)).toContainText(c.error[0]);
      } finally {
        runDb("restore", "articles");
      }
      await page.goto(target);
      await expect(section(page, "progress")).toBeVisible();
    });
  });

  test.describe(`${locale}: unknown venture`, () => {
    test.use({ allowErrorResponses: true });

    for (const slug of ["nope", "PERFORMA-VISION", "performa-vision-2", "meta-klinik%20"]) {
      test(`${slug} answers HTTP 404 with the localised not-found page`, async ({ page }) => {
        const response = await page.goto(`/${locale}/ventures/${slug}`);
        expect(response?.status()).toBe(404);
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(copy[locale].notFound[0]);
        await expect(main(page)).toContainText(copy[locale].notFound[1]);
        await expect(page.getByRole("banner").getByRole("navigation")).toBeVisible();
      });
    }

    test("/ventures itself has no page: 404", async ({ page }) => {
      const response = await page.goto(`/${locale}/ventures`);
      expect(response?.status()).toBe(404);
    });
  });

  test.describe(`${locale}: from the Radar`, () => {
    test("the card's link opens the view, and its count is the number of related news the view lists", async ({ page }) => {
      for (const v of [performa, pasar]) {
        await page.goto(`/${locale}`);
        const open = page.locator(`li[data-venture="${v.slug}"] [data-venture-news]`);
        await expect(open).toHaveText(c.open(relatedCount(v)));
        await open.click();
        await expect(page).toHaveURL(url(locale, v));
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(v.name);
        // Every page of the list: the same number as the card said.
        for (;;) {
          const more = section(page, "news").getByRole("link", { name: c.news.loadMore, exact: true });
          if ((await more.count()) === 0) break;
          const before = await newsItems(page).count();
          await more.click();
          await expect(newsItems(page)).not.toHaveCount(before);
        }
        await expect(newsItems(page)).toHaveCount(relatedCount(v));
      }
    });

    test("the language switch keeps the venture", async ({ page }) => {
      await page.goto(url(locale, performa));
      const other = locale === "en" ? "id" : "en";
      await page.getByRole("group", { name: locale === "en" ? "Language" : "Bahasa" }).getByRole("link", { name: other.toUpperCase() }).click();
      await expect(page).toHaveURL(url(other, performa));
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(performa.name);
    });
  });

  test.describe(`${locale}: text, safety and layout`, () => {
    test("untrusted text is shown as text: markup in a wind or a headline is written out and nothing executes; no other origin is contacted", async ({ page, baseURL }) => {
      const outside: string[] = [];
      page.on("request", (request) => {
        if (!/^(data|blob):/.test(request.url()) && new URL(request.url()).origin !== new URL(baseURL!).origin) outside.push(request.url());
      });
      await page.goto(url(locale, performa));
      await expect(wind(page, "tailwind")).toContainText(ventureInjection);
      await expect(main(page).locator("script, b, img")).toHaveCount(0);
      await page.goto(url(locale, meta));
      await expect(main(page)).toContainText(locale === "en" ? "<b>bold</b>" : "<b>tebal</b>");
      await page.goto(url(locale, pasar));
      await expect(newsItem(page, headlines.markup).first()).toContainText('<img src=x onerror="window.__pwned=1">');
      await expect(main(page).locator("script, b, img")).toHaveCount(0);
      expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
      expect(outside).toEqual([]);
    });

    test("a very long word in every text does not scroll the page sideways", async ({ page }) => {
      for (const v of [performa, pasar]) {
        await page.goto(url(locale, v));
        expect(await overflows(page)).toBe(false);
        await page.evaluate(() => {
          const word = "Superpanjang".repeat(17);
          document.querySelectorAll("main h1, main h1 + p, [data-wind] p, section[aria-labelledby=venture-news] li a, section[aria-labelledby=venture-news] li span, [data-venture-progress] p").forEach((element) => element.append(word));
        });
        expect(await overflows(page), "a long text scrolls the page sideways").toBe(false);
      }
    });

    test("layout: progress full width, the two market cards side by side, the winds beside the news; one column on a phone", async ({ page }) => {
      await page.goto(url(locale, performa));
      const progress = await box(section(page, "progress"));
      const id = await box(region(page, "indonesia"));
      const world = await box(region(page, "global"));
      const winds = await box(section(page, "winds"));
      const news = await box(section(page, "news"));
      if (wide(page)) {
        expect(Math.abs(id.y - world.y)).toBeLessThan(2);
        expect(world.x).toBeGreaterThan(id.x + id.width - 1);
        expect(Math.round(id.width)).toBe(Math.round(world.width));
        expect(Math.abs(progress.width - (world.x + world.width - id.x))).toBeLessThan(2); // as wide as the two cards together
        expect(Math.abs(winds.y - news.y)).toBeLessThan(2);
        expect(news.x).toBeGreaterThan(winds.x + winds.width - 1); // pair left, news right
      } else {
        // Progress, Indonesia, Worldwide, the pair, the news: one under the other, each as wide as the page's column.
        const order = [progress, id, world, winds, news];
        for (const [index, item] of order.slice(1).entries()) expect(item.y).toBeGreaterThan(order[index].y + order[index].height - 1);
        expect(Math.round(id.width)).toBe(Math.round(world.width));
        expect(Math.round(winds.width)).toBe(Math.round(news.width));
      }
      expect(await overflows(page)).toBe(false);
    });

    test("every page of the view stays inside the screen", async ({ page }) => {
      for (const v of fixtureVentures) {
        await page.goto(url(locale, v));
        await expect(section(page, "progress")).toBeVisible();
        expect(await overflows(page)).toBe(false);
      }
    });
  });
}
