import type { Locator, Page } from "@playwright/test";
import { e2eDatabaseUrl } from "../scripts/e2e-env";
import { resetFixtures, runDb } from "./db";
import { expect, test } from "./fixtures";
import { expectSkeletonOnNavigation } from "./skeleton";

// The Investments screen (OR-30): term toggle, six risk cards, the watchlist with signals, the Sample rules and the
// states. The fixtures are in e2e/market-fixtures.ts (prices) and the signals next to them; the server is a production
// build, so SHOW_SAMPLE_SIGNALS is ignored and a made-up price never shows a verdict. The clock is the real one:
// what depends on market hours is computed here with a small independent implementation (and covered rule by rule
// in src/lib/market/hours.test.ts).

const NBSP = " ";

const copy = {
  en: {
    title: "Investments",
    intro: "Compare the risk of each asset type, then see what the rules say.",
    term: { short: "Short term (days–weeks)", long: "Long term (1 year+)" },
    termLabel: { short: "Short term", long: "Long term" },
    classes: "Asset types and their risk",
    risk: (n: number, label: string) => `Risk ${n}/5 · ${label}`,
    riskWord: { 1: "Low", 2: "Low–medium", 3: "Medium", 4: "High", 5: "Very high" },
    drop: "Typical drop",
    mainRisks: "Main risks",
    watchlist: { short: "Watchlist — short-term signals", long: "Watchlist — long-term signals" },
    cols: ["Asset", "Price", "1 day", "30 days", "Signal", "Risk"],
    signal: { BUY: "BUY", HOLD: "HOLD", SELL: "SELL", none: "Not enough history", stale: "No signal: prices are out of date", sample: "No signal: sample data" },
    sample: { badge: "Sample", label: "Sample data, not real prices", explain: "These prices are made up to test the app. Real prices are used once the live data source is switched on." },
    disclaimer: "Signals are produced by fixed, published rules on price data. They are information for your own decision, not financial advice, and past behaviour does not guarantee future results.",
    stale: "Out of date",
    staleLine: (when: string) => `Prices last updated ${when} WIB`,
    closed: (date: string) => `Market closed · last close ${date}`,
    never: ["No data yet", "The first update runs at 07:00 WIB."],
    error: ["Can't load this right now", "Try again in a moment. If it keeps happening, the local database may be stopped.", "Try again"],
    label: { up: (p: string) => `up ${p}`, down: (p: string) => `down ${p}`, flat: "unchanged", none: "change not available" },
    months: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
    trend: /^30 days: .+ → .+$/,
    gone: /alert|add asset|send alerts/i,
  },
  id: {
    title: "Investasi",
    intro: "Bandingkan risiko tiap jenis aset, lalu lihat apa kata aturannya.",
    term: { short: "Jangka pendek (hari–minggu)", long: "Jangka panjang (1 tahun+)" },
    termLabel: { short: "Jangka pendek", long: "Jangka panjang" },
    classes: "Jenis aset dan risikonya",
    risk: (n: number, label: string) => `Risiko ${n}/5 · ${label}`,
    riskWord: { 1: "Rendah", 2: "Rendah–sedang", 3: "Sedang", 4: "Tinggi", 5: "Sangat tinggi" },
    drop: "Penurunan umum",
    mainRisks: "Risiko utama",
    watchlist: { short: "Daftar pantau — sinyal jangka pendek", long: "Daftar pantau — sinyal jangka panjang" },
    cols: ["Aset", "Harga", "1 hari", "30 hari", "Sinyal", "Risiko"],
    signal: { BUY: "BELI", HOLD: "TAHAN", SELL: "JUAL", none: "Riwayat belum cukup", stale: "Tanpa sinyal: harga belum diperbarui", sample: "Tanpa sinyal: data contoh" },
    sample: { badge: "Contoh", label: "Data contoh, bukan harga nyata", explain: "Harga ini dibuat untuk menguji aplikasi. Harga nyata dipakai setelah sumber data langsung diaktifkan." },
    disclaimer: "Sinyal dihasilkan oleh aturan tetap yang dipublikasikan atas data harga. Ini informasi untuk keputusan Anda sendiri, bukan nasihat keuangan, dan perilaku masa lalu tidak menjamin hasil di masa depan.",
    stale: "Belum diperbarui",
    staleLine: (when: string) => `Harga terakhir diperbarui ${when} WIB`,
    closed: (date: string) => `Pasar tutup · penutupan terakhir ${date}`,
    never: ["Belum ada data", "Pembaruan pertama berjalan pukul 07.00 WIB."],
    error: ["Tidak dapat memuat sekarang", "Coba lagi sebentar lagi. Jika terus terjadi, database lokal mungkin berhenti.", "Coba lagi"],
    label: { up: (p: string) => `naik ${p}`, down: (p: string) => `turun ${p}`, flat: "tidak berubah", none: "perubahan tidak tersedia" },
    months: ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"],
    trend: /^30 hari: .+ → .+$/,
    gone: /peringatan|tambah aset|kirim peringatan/i,
  },
} as const;

type Locale = keyof typeof copy;
type Term = "short" | "long";
type Shown = "BUY" | "HOLD" | "SELL" | "none" | "stale" | "sample";

// The six risk cards, from copy.md §7.1 (the text is reviewed content: these must match it word for word).
const cards = [
  { key: "cash", risk: 1, en: {"name": "Cash & government bonds", "eg": "Money market, SBN", "drop": "A few percent", "long": "Stability and income; often used for emergency savings", "short": "Low-volatility place for cash between trades", "risks": "Inflation, interest-rate changes"}, id: {"name": "Kas & obligasi negara", "eg": "Money market, SBN", "drop": "Beberapa persen", "long": "Stabil dan memberi pendapatan; sering dipakai untuk dana darurat", "short": "Tempat kas yang tenang di antara transaksi", "risks": "Inflasi, perubahan suku bunga"} },
  { key: "gold", risk: 2, en: {"name": "Gold", "eg": "XAU, Antam", "drop": "10–20% over a year", "long": "Store of value; tends to hold up when the rupiah weakens", "short": "Slow mover; the buy/sell spread takes much of a short move", "risks": "No income, USD and interest rates, dealer spread"}, id: {"name": "Emas", "eg": "XAU, Antam", "drop": "10–20% dalam setahun", "long": "Penyimpan nilai; cenderung bertahan saat rupiah melemah", "short": "Bergerak lambat; selisih jual-beli memakan sebagian besar gerakan singkat", "risks": "Tanpa pendapatan, USD dan suku bunga, selisih dealer"} },
  { key: "silver", risk: 3, en: {"name": "Silver", "eg": "XAG", "drop": "20–35%", "long": "Often held as a smaller hedge next to gold", "short": "Swings more than gold; short moves can be large in both directions", "risks": "Industrial demand cycles, thin retail market"}, id: {"name": "Perak", "eg": "XAG", "drop": "20–35%", "long": "Sering dipegang sebagai lindung nilai kecil di samping emas", "short": "Berayun lebih besar dari emas; gerakan singkat bisa besar ke dua arah", "risks": "Siklus permintaan industri, pasar ritel tipis"} },
  { key: "idStocks", risk: 4, en: {"name": "Indonesian stocks", "eg": "IDX: BBCA, TLKM", "drop": "30–50% in a crisis", "long": "Growth and dividends over 5 years or more", "short": "Short-term moves are mostly in liquid blue chips", "risks": "Company results, foreign fund flows, rupiah"}, id: {"name": "Saham Indonesia", "eg": "IDX: BBCA, TLKM", "drop": "30–50% saat krisis", "long": "Pertumbuhan dan dividen dalam 5 tahun atau lebih", "short": "Gerakan jangka pendek sebagian besar pada saham unggulan yang likuid", "risks": "Kinerja emiten, aliran dana asing, rupiah"} },
  { key: "globalStocks", risk: 4, en: {"name": "Global stocks", "eg": "S&P 500, Nasdaq", "drop": "30–50% in a crisis", "long": "Diversification outside Indonesia", "short": "Driven by earnings dates and US rates", "risks": "USD/IDR rate, valuation, access and tax"}, id: {"name": "Saham global", "eg": "S&P 500, Nasdaq", "drop": "30–50% saat krisis", "long": "Diversifikasi di luar Indonesia", "short": "Digerakkan jadwal laporan laba dan suku bunga AS", "risks": "Kurs USD/IDR, valuasi, akses dan pajak"} },
  { key: "crypto", risk: 5, en: {"name": "Crypto", "eg": "BTC, ETH", "drop": "50–80%", "long": "Highly speculative; many holders keep it to a small part of their savings", "short": "Fast moves, 24/7; losses can be large and quick", "risks": "Extreme volatility, regulation, exchange failure"}, id: {"name": "Kripto", "eg": "BTC, ETH", "drop": "50–80%", "long": "Sangat spekulatif; banyak pemegang menjaganya sebagai bagian kecil dari tabungan", "short": "Gerakan cepat, 24/7; kerugian bisa besar dan cepat", "risks": "Volatilitas ekstrem, regulasi, kegagalan bursa"} },
] as const;

/** What the fixtures show per watchlist row, in display order (see e2e/market-fixtures.ts for the numbers and signals). */
const rows = [
  { slug: "ihsg", name: { en: "IHSG", id: "IHSG" }, kind: { en: "Index · IDX", id: "Indeks · IDX" }, price: { en: "7,412", id: "7.412" }, dir: "up", pct: { en: "0.6%", id: "0,6%" }, points: 10, risk: 4, sample: false, signal: { short: "BUY", long: "HOLD" } },
  { slug: "bbca", name: { en: "BBCA", id: "BBCA" }, kind: { en: "Stock · IDX", id: "Saham · BEI" }, price: { en: `Rp${NBSP}9,875`, id: `Rp${NBSP}9.875` }, dir: "down", pct: { en: "0.3%", id: "0,3%" }, points: 30, risk: 4, sample: false, signal: { short: "SELL", long: "none" } },
  { slug: "sp500", name: { en: "S&P 500", id: "S&P 500" }, kind: { en: "Index · US", id: "Indeks · US" }, price: { en: "6,820", id: "6.820" }, dir: "up", pct: { en: "0.4%", id: "0,4%" }, points: 30, risk: 4, sample: false, signal: { short: "none", long: "BUY" } },
  { slug: "gold", name: { en: "Gold", id: "Emas" }, kind: { en: "IDR per gram", id: "IDR per gram" }, price: { en: `Rp${NBSP}1,935,100`, id: `Rp${NBSP}1.935.100` }, dir: "flat", pct: { en: "0.0%", id: "0,0%" }, points: 10, risk: 2, sample: false, signal: { short: "HOLD", long: "BUY" } },
  { slug: "silver", name: { en: "Silver", id: "Perak" }, kind: { en: "IDR per gram", id: "IDR per gram" }, price: { en: `Rp${NBSP}22,400`, id: `Rp${NBSP}22.400` }, dir: "up", pct: { en: "0.8%", id: "0,8%" }, points: 30, risk: 3, sample: false, signal: { short: "BUY", long: "stale" } },
  // A made-up quote over real closes: mixed provenance, so no change and no sparkline.
  { slug: "bitcoin", name: { en: "Bitcoin", id: "Bitcoin" }, kind: { en: "Crypto · USD", id: "Kripto · USD" }, price: { en: "$98,400", id: "US$98.400" }, dir: "none", pct: { en: "", id: "" }, points: 0, risk: 5, sample: true, signal: { short: "sample", long: "sample" } },
  { slug: "ethereum", name: { en: "Ethereum", id: "Ethereum" }, kind: { en: "Crypto · USD", id: "Kripto · USD" }, price: { en: "$3,120", id: "US$3.120" }, dir: "down", pct: { en: "3.1%", id: "3,1%" }, points: 30, risk: 5, sample: true, signal: { short: "sample", long: "sample" } },
] as const;

const arrow = { up: "▲", down: "▼", flat: "—" } as const;

const main = (page: Page) => page.locator("main");
const table = (page: Page) => main(page).locator("table[aria-labelledby]");
const rowOf = (page: Page, slug: string) => main(page).locator(`tr[data-watch-row="${slug}"]`);
const toggle = (page: Page) => main(page).locator("[data-term-toggle]").getByRole("link");
const box = async (locator: Locator) => (await locator.boundingBox())!;
const overflows = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
const isPhone = (page: Page) => page.viewportSize()!.width <= 640;
const url = (locale: Locale, term?: Term) => `/${locale}/invest${term === "short" ? "?term=short" : ""}`;

/** WIB weekday (0 = Monday) and clock parts of an instant, computed by hand. */
function wib(at: Date) {
  const s = new Date(at.getTime() + 7 * 3600_000);
  return { weekday: (s.getUTCDay() + 6) % 7, hour: s.getUTCHours(), minute: s.getUTCMinutes(), day: s.getUTCDate(), month: s.getUTCMonth(), ymd: s.toISOString().slice(0, 10) };
}
const clock = (at: Date, locale: Locale) => `${String(wib(at).hour).padStart(2, "0")}${locale === "id" ? "." : ":"}${String(wib(at).minute).padStart(2, "0")}`;
const dateOf = (at: Date, locale: Locale) => `${wib(at).day} ${copy[locale].months[wib(at).month]}`;
/** IDX: Mon-Fri 09:00-16:00 WIB. Gold and silver: Mon 05:00 to Sat 04:00 WIB. Says whether the market is shut right now. */
function closedNow(slug: "ihsg" | "bbca" | "gold" | "silver", at = new Date()) {
  const { weekday, hour, minute } = wib(at);
  const mins = hour * 60 + minute;
  if (slug === "ihsg" || slug === "bbca") return !(weekday <= 4 && mins >= 9 * 60 && mins < 16 * 60);
  return (weekday === 5 && mins >= 4 * 60) || weekday === 6 || (weekday === 0 && mins < 5 * 60);
}

for (const locale of ["en", "id"] as const) {
  const c = copy[locale];

  test(`${locale}: the title, the intro and the two terms; long term is the default, with one current link at least 44 px tall`, async ({ page }) => {
    await page.goto(url(locale));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(c.title);
    await expect(main(page)).toContainText(c.intro);
    await expect(toggle(page)).toHaveText([c.term.short, c.term.long]);
    await expect(toggle(page).nth(0)).not.toHaveAttribute("aria-current", /.*/);
    await expect(toggle(page).nth(1)).toHaveAttribute("aria-current", "true");
    for (const link of await toggle(page).all()) expect((await box(link)).height).toBeGreaterThanOrEqual(44);
    // Real links, so the toggle works without scripts; the default term needs no parameter.
    await expect(toggle(page).nth(0)).toHaveAttribute("href", `/${locale}/invest?term=short`);
    await expect(toggle(page).nth(1)).toHaveAttribute("href", `/${locale}/invest`);
    await expect(page.getByRole("heading", { level: 2, name: c.watchlist.long })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: c.classes })).toBeVisible();
    expect(await overflows(page)).toBe(false);
  });

  test(`${locale}: switching to short term changes the signals and the URL holds ?term=short, also after a reload; Long goes back`, async ({ page }) => {
    await page.goto(url(locale));
    for (const r of rows) await expect(rowOf(page, r.slug).locator("[data-signal]")).toHaveText(c.signal[r.signal.long === "none" ? "none" : r.signal.long]);

    await toggle(page).nth(0).click();
    await expect(page).toHaveURL(new RegExp(`/${locale}/invest\\?term=short$`));
    await expect(toggle(page).nth(0)).toHaveAttribute("aria-current", "true");
    await expect(toggle(page).nth(1)).not.toHaveAttribute("aria-current", /.*/);
    await expect(page.getByRole("heading", { level: 2, name: c.watchlist.short })).toBeVisible();
    for (const r of rows) await expect(rowOf(page, r.slug).locator("[data-signal]")).toHaveText(c.signal[r.signal.short]);

    await page.reload();
    await expect(page).toHaveURL(new RegExp(`/${locale}/invest\\?term=short$`));
    await expect(toggle(page).nth(0)).toHaveAttribute("aria-current", "true");
    for (const r of rows) await expect(rowOf(page, r.slug).locator("[data-signal]")).toHaveText(c.signal[r.signal.short]);

    await toggle(page).nth(1).click();
    await expect(page).toHaveURL(`/${locale}/invest`);
    await expect(toggle(page).nth(1)).toHaveAttribute("aria-current", "true");
    await expect(page.getByRole("heading", { level: 2, name: c.watchlist.long })).toBeVisible();
  });

  test(`${locale}: a term that is not "short" is long term, and the other query values stay in both links`, async ({ page }) => {
    for (const junk of ["?term=weird", "?term=SHORT", "?term=", "?term=short&term=long"]) {
      await page.goto(`/${locale}/invest${junk}`);
      await expect(toggle(page).nth(1), junk).toHaveAttribute("aria-current", "true");
      await expect(page.getByRole("heading", { level: 2, name: c.watchlist.long })).toBeVisible();
    }
    await page.goto(`/${locale}/invest?x=1&term=short`);
    await expect(toggle(page).nth(0)).toHaveAttribute("href", `/${locale}/invest?x=1&term=short`);
    await expect(toggle(page).nth(1)).toHaveAttribute("href", `/${locale}/invest?x=1`);
  });

  for (const term of ["long", "short"] as const) {
    test(`${locale}: six risk cards (${term} term) with bars, the number and the label, and the reviewed texts`, async ({ page }) => {
      await page.goto(url(locale, term));
      const list = main(page).locator("li[data-risk-card]");
      await expect(list).toHaveCount(6);
      expect(await list.evaluateAll((items) => items.map((item) => item.getAttribute("data-risk-card")))).toEqual(cards.map((card) => card.key));
      for (const card of cards) {
        const item = main(page).locator(`li[data-risk-card="${card.key}"]`);
        const t = card[locale];
        await expect(item.getByRole("heading", { level: 3 })).toHaveText(t.name);
        await expect(item).toContainText(t.eg);
        await expect(item).toContainText(c.risk(card.risk, c.riskWord[card.risk]));
        // The bars: five, as many filled as the level, hidden from screen readers (the text says it).
        const bars = item.locator("[data-risk-bars]");
        await expect(bars).toHaveAttribute("aria-hidden", "true");
        await expect(bars).toHaveAttribute("data-risk-bars", String(card.risk));
        const colours = await bars.locator("span").evaluateAll((spans) => spans.map((span) => getComputedStyle(span).backgroundColor));
        expect(colours).toHaveLength(5);
        expect(colours.filter((colour) => colour !== "rgb(75, 62, 117)")).toHaveLength(card.risk);
        // The definition list: typical drop, the text for the selected term only, main risks.
        await expect(item.locator("dt")).toHaveText([c.drop, c.termLabel[term], c.mainRisks]);
        await expect(item.locator("dd")).toHaveText([t.drop, t[term], t.risks]);
        await expect(item).not.toContainText(t[term === "long" ? "short" : "long"]);
      }
      // One column on a phone, a grid on a desktop.
      const xs = new Set(await Promise.all((await list.all()).map(async (item) => Math.round((await box(item)).x))));
      if (isPhone(page)) expect(xs.size).toBe(1);
      else expect(xs.size).toBeGreaterThanOrEqual(3);
      expect(await overflows(page)).toBe(false);
    });
  }

  test(`${locale}: one row per watchlist asset, in order, with name, kind, price, change, sparkline, signal, risk and a link`, async ({ page }) => {
    await page.goto(url(locale));
    await expect(main(page).locator("tr[data-watch-row]")).toHaveCount(7);
    expect(await main(page).locator("tr[data-watch-row]").evaluateAll((items) => items.map((item) => item.getAttribute("data-watch-row")))).toEqual(rows.map((r) => r.slug));
    // USD/IDR and the IDR crypto pairs are not on the watchlist.
    await expect(main(page).locator("tbody")).not.toContainText("USD/IDR");

    for (const r of rows) {
      const row = rowOf(page, r.slug);
      await expect(row.locator("th a")).toHaveText(r.name[locale]);
      await expect(row.locator("th")).toContainText(r.kind[locale]);
      await expect(row.locator("[data-watch-price]")).toHaveText(r.price[locale]);

      // The change: an arrow (or a dash) and the unsigned percent for the eye, "up 0.6%" for a screen reader.
      const change = row.locator("[data-watch-change]");
      await expect(change).toHaveAttribute("data-watch-change", r.dir);
      if (r.dir === "none") {
        await expect(change.locator('[aria-hidden="true"]')).toHaveText("—");
        await expect(change.locator(".sr-only")).toHaveText(c.label.none);
      } else {
        await expect(change.locator('[aria-hidden="true"]')).toHaveText(`${arrow[r.dir]} ${r.pct[locale]}`);
        await expect(change.locator(".sr-only")).toHaveText(r.dir === "flat" ? c.label.flat : c.label[r.dir](r.pct[locale]));
      }

      // The sparkline: decorative, with its closes (10 or 30; none for the mixed row) and a hidden summary.
      const spark = row.locator("svg[data-watch-spark]");
      if (r.points === 0) {
        await expect(spark).toHaveCount(0);
      } else {
        await expect(spark).toHaveAttribute("aria-hidden", "true");
        await expect(spark).toHaveAttribute("viewBox", "0 0 96 28");
        expect((await spark.locator("polyline").getAttribute("points"))!.split(" ")).toHaveLength(r.points);
        await expect(row.locator("td .sr-only").filter({ hasText: /→/ })).toHaveText(c.trend);
      }

      await expect(row.locator("[data-watch-risk]")).toHaveAttribute("data-watch-risk", String(r.risk));
      await expect(row.locator("[data-watch-risk]")).toContainText(`${r.risk}/5`);

      // The row links to the asset report, with a tap target of at least 44 px.
      const link = row.locator("th a");
      await expect(link).toHaveAttribute("href", `/${locale}/invest/${r.slug}`);
      expect((await box(link)).height).toBeGreaterThanOrEqual(44);
    }
    expect(await overflows(page)).toBe(false);
  });

  test(`${locale}: the table is a real table on a desktop and a list of cards on a phone, with no sideways scroll`, async ({ page }) => {
    await page.goto(url(locale));
    // The structure is the same in both: column headers, one row header per asset.
    await expect(table(page).locator('th[scope="col"]')).toHaveText(c.cols);
    await expect(table(page).locator('th[scope="row"]')).toHaveCount(7);
    const width = page.viewportSize()!.width;
    if (isPhone(page)) {
      await expect(table(page).locator("thead")).toHaveCSS("position", "absolute"); // visually hidden, still read
      for (const r of rows) {
        const row = rowOf(page, r.slug);
        await expect(row).toHaveCSS("display", "grid");
        const card = await box(row);
        expect(card.x).toBeGreaterThanOrEqual(0);
        expect(card.x + card.width).toBeLessThanOrEqual(width);
        // Name and kind, then price and change, then the sparkline below the price; the signal is on the name's line.
        const name = await box(row.locator("th a"));
        const price = await box(row.locator("[data-watch-price]"));
        const signal = await box(row.locator("[data-signal]"));
        expect(price.y).toBeGreaterThan(name.y);
        expect(Math.abs(signal.y + signal.height / 2 - (name.y + name.height / 2))).toBeLessThan(40);
        if (r.points > 0) expect((await box(row.locator("svg[data-watch-spark]"))).y).toBeGreaterThan(price.y + price.height - 1);
      }
    } else {
      await expect(table(page)).toHaveCSS("display", "table");
      await expect(table(page).locator('th[scope="col"]').first()).toBeVisible();
      const ys: number[] = [];
      for (const r of rows) ys.push((await box(rowOf(page, r.slug))).y);
      expect([...ys].sort((a, b) => a - b)).toEqual(ys);
    }
    for (const term of ["long", "short"] as const) {
      await page.goto(url(locale, term));
      expect(await overflows(page), term).toBe(false);
    }
  });

  test(`${locale}: every signal is a word or a text, never colour alone, and the chips differ in outline too`, async ({ page }) => {
    for (const term of ["long", "short"] as const) {
      await page.goto(url(locale, term));
      for (const r of rows) {
        const cell = rowOf(page, r.slug).locator("[data-signal]");
        const shown: Shown = r.signal[term];
        await expect(cell).toHaveAttribute("data-signal", shown);
        await expect(cell).toHaveText(c.signal[shown]);
      }
    }
    // The three verdicts: BUY a thick solid outline, HOLD a thin solid one, SELL a double one.
    await page.goto(url(locale, "short"));
    const style = (slug: string) => rowOf(page, slug).locator("[data-signal]").evaluate((el) => ({ style: getComputedStyle(el).borderTopStyle, width: getComputedStyle(el).borderTopWidth }));
    expect(await style("ihsg")).toEqual({ style: "solid", width: "2px" }); // BUY
    expect(await style("gold")).toEqual({ style: "solid", width: "1px" }); // HOLD
    expect(await style("bbca")).toEqual({ style: "double", width: "3px" }); // SELL
    // A stale signal keeps its last verdict in the store but shows none; "no signal" texts have no chip outline.
    await page.goto(url(locale));
    await expect(rowOf(page, "silver").locator("[data-signal]")).toHaveCSS("border-top-width", "0px");
  });

  test(`${locale}: the sample rows have the dashed "${c.sample.badge}" word beside the price and "No signal: sample data"; the real ones have neither; one label and explanation above the table`, async ({ page }) => {
    await page.goto(url(locale));
    for (const r of rows) {
      const badge = rowOf(page, r.slug).locator("[data-sample-badge]");
      if (!r.sample) {
        await expect(badge).toHaveCount(0);
        continue;
      }
      await expect(badge).toHaveText(c.sample.badge);
      await expect(badge).toHaveCSS("border-top-style", "dashed");
      const price = await box(rowOf(page, r.slug).locator("[data-watch-price]"));
      const word = await box(badge);
      expect(Math.abs(word.y + word.height / 2 - (price.y + price.height / 2))).toBeLessThan(12);
      expect(word.x).toBeGreaterThan(price.x + price.width - 1);
      await expect(rowOf(page, r.slug).locator("[data-signal]")).toHaveText(c.signal.sample);
    }
    const note = main(page).locator("[data-sample-note]");
    await expect(note).toHaveCount(1);
    await expect(note.locator("p").first()).toHaveText(c.sample.label);
    await expect(note.locator("p").last()).toHaveText(c.sample.explain);
    await expect(note.locator("p").first()).toHaveAttribute("aria-describedby", "inv-sample-explain");
    await expect(note.locator("#inv-sample-explain")).toHaveText(c.sample.explain);
    expect((await box(note)).y + (await box(note)).height).toBeLessThanOrEqual((await box(table(page))).y);
    // The label belongs to cards and the report, not to the watchlist (copy.md §8.2).
    await expect(main(page)).not.toContainText(/computed on sample data|dihitung dari data contoh/);
  });

  test(`${locale}: with real prices only there is no Sample word and no sample line, and the verdicts show`, async ({ page }) => {
    try {
      runDb("fixtures", "--real-prices");
      await page.goto(url(locale, "short"));
      await expect(main(page).locator("[data-sample-badge]")).toHaveCount(0);
      await expect(main(page).locator("[data-sample-note]")).toHaveCount(0);
      await expect(main(page)).not.toContainText(c.sample.label);
      await expect(main(page)).not.toContainText(c.sample.explain);
      await expect(rowOf(page, "bitcoin").locator("[data-signal]")).toHaveText(c.signal.SELL);
      await expect(rowOf(page, "bitcoin").locator("[data-watch-change]")).toHaveAttribute("data-watch-change", "down"); // no longer mixed
      await expect(rowOf(page, "ethereum").locator("[data-signal]")).toHaveText(c.signal.SELL);
    } finally {
      resetFixtures();
    }
  });

  test(`${locale}: the disclaimer is under the watchlist`, async ({ page }) => {
    await page.goto(url(locale));
    const text = main(page).getByText(c.disclaimer, { exact: true });
    await expect(text).toBeVisible();
    await expect(main(page).locator("[data-disclaimer]")).toHaveCount(1);
    expect((await box(text)).y).toBeGreaterThanOrEqual((await box(table(page))).y + (await box(table(page))).height);
  });

  test(`${locale}: no alerts list, no add-asset button, no alert settings, no request to another origin`, async ({ page, baseURL }) => {
    const outside: string[] = [];
    page.on("request", (request) => {
      if (!/^(data|blob):/.test(request.url()) && new URL(request.url()).origin !== new URL(baseURL!).origin) outside.push(request.url());
    });
    for (const term of ["long", "short"] as const) {
      await page.goto(url(locale, term));
      await expect(main(page).getByText(c.disclaimer)).toBeVisible();
      expect(await main(page).innerText()).not.toMatch(c.gone);
      await expect(main(page).locator("button, input, select, textarea, form")).toHaveCount(0);
      await expect(main(page).getByRole("heading", { level: 2 })).toHaveText([c.classes, c.watchlist[term]]);
    }
    expect(outside).toEqual([]);
  });

  test(`${locale}: a row opens the asset report`, async ({ page }) => {
    await page.goto(url(locale));
    await rowOf(page, "gold").locator("th a").click();
    await expect(page).toHaveURL(`/${locale}/invest/gold`);
    await expect(page.getByRole("banner").locator('[aria-current="page"]')).toHaveCount(1);
  });

  test(`${locale}: a Bitcoin and Ethereum run 2 hours old (24/7) marks both rows as out of date and adds one "Prices last updated" line above the table; the others stay fresh`, async ({ page }) => {
    try {
      const { cryptoRun } = JSON.parse(runDb("fixtures", `--crypto-run=${120}`));
      const run = new Date(cryptoRun);
      await page.goto(url(locale));
      const when = wib(run).ymd === wib(new Date()).ymd ? clock(run, locale) : `${dateOf(run, locale)}, ${clock(run, locale)}`;
      await expect(page.getByRole("status")).toHaveCount(1);
      await expect(main(page).getByRole("status")).toHaveText(c.staleLine(when));
      await expect(main(page).getByText(c.stale, { exact: true })).toHaveCount(2);
      for (const slug of ["bitcoin", "ethereum"]) await expect(rowOf(page, slug)).toContainText(c.stale);
      for (const slug of ["ihsg", "bbca", "sp500", "gold", "silver"]) await expect(rowOf(page, slug)).not.toContainText(c.stale);
      expect((await box(main(page).getByRole("status"))).y).toBeLessThan((await box(table(page))).y);
    } finally {
      resetFixtures();
    }
  });

  test(`${locale}: fresh runs show no stale marker and no stale line; a shut market shows its last close instead`, async ({ page }) => {
    // Stored now (other tests reset the fixtures, which moves the quotes' as-of time).
    const marketAsOf = new Date(JSON.parse(runDb("fixtures")).marketAsOf);
    const before = { ihsg: closedNow("ihsg"), bbca: closedNow("bbca"), gold: closedNow("gold"), silver: closedNow("silver") };
    await page.goto(url(locale));
    const after = { ihsg: closedNow("ihsg"), bbca: closedNow("bbca"), gold: closedNow("gold"), silver: closedNow("silver") };
    await expect(page.getByRole("status")).toHaveCount(0);
    await expect(main(page).getByText(c.stale, { exact: true })).toHaveCount(0);
    for (const slug of ["ihsg", "bbca", "gold", "silver"] as const) {
      if (before[slug] !== after[slug]) continue; // the market opened or closed while the page loaded
      if (before[slug]) await expect(rowOf(page, slug)).toContainText(c.closed(dateOf(marketAsOf, locale)));
      else await expect(rowOf(page, slug)).not.toContainText(c.closed("").trim());
    }
    await expect(rowOf(page, "bitcoin")).not.toContainText(c.closed("").trim()); // 24/7: never closed
  });

  test(`${locale}: nothing ever ingested shows "No data yet" and the first update time in place of the watchlist; the risk cards stay`, async ({ page }) => {
    try {
      runDb("fixtures", "--no-market");
      await page.goto(url(locale));
      const never = main(page).locator("[data-never]");
      await expect(never).toContainText(c.never[0]);
      await expect(never).toContainText(c.never[1]);
      await expect(table(page)).toHaveCount(0);
      await expect(main(page).locator("li[data-risk-card]")).toHaveCount(6);
      await expect(main(page).getByText(c.disclaimer)).toBeVisible();
      await expect(page.getByRole("status")).toHaveCount(0);
    } finally {
      resetFixtures();
    }
  });

  test(`${locale}: when the store cannot be read the page shows the error card without details`, async ({ page }) => {
    const url_ = url(locale);
    await page.goto(url_);
    await expect(rowOf(page, "ihsg")).toBeVisible();
    try {
      runDb("break", "assets");
      await page.goto(url_);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(c.title);
      await expect(main(page)).toContainText(c.error[0]);
      await expect(main(page)).toContainText(c.error[1]);
      await expect(page.getByRole("link", { name: c.error[2], exact: true })).toHaveAttribute("href", url_);
      await expect(table(page)).toHaveCount(0);
      await expect(page.getByRole("banner").getByRole("navigation")).toBeVisible();
      const db = new URL(e2eDatabaseUrl());
      const html = await page.content();
      for (const detail of [db.hostname, db.port, "relation", "assets__off", "42P01"]) {
        expect(html, `the page must not show "${detail}"`).not.toContain(detail);
      }
    } finally {
      runDb("restore", "assets");
    }
  });
}

test("the screen has a loading state: while the data loads, the skeleton is on screen", async ({ page }) => {
  await expectSkeletonOnNavigation(page, {
    from: "/en/news",
    link: "Investments",
    target: /\/en\/invest\?_rsc=/,
    loaded: () => page.getByRole("heading", { level: 1, name: "Investments" }),
  });
});
