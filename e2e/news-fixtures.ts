// Deterministic News data for the browser tests. Pure data (no database access):
// scripts/e2e-db.ts stores it, e2e/news.spec.ts reads the expected counts from it.

export type FixtureRegion = "indonesia" | "global";
export type FixtureCategory = "business" | "politics" | "tech-ai" | "markets" | "commodities";

export const longSourceName =
  "Kementerian Perdagangan Republik Indonesia Direktorat Jenderal Perdagangan Dalam Negeri";

export const fixtureSources: { slug: string; name: string; region: FixtureRegion }[] = [
  { slug: "antara", name: "Antara", region: "indonesia" },
  { slug: "cnbc-indonesia", name: "CNBC Indonesia", region: "indonesia" },
  { slug: "kemendag", name: longSourceName, region: "indonesia" },
  // Configured but without an article today: listed in the Sources panel, not counted in the header.
  { slug: "katadata", name: "Katadata", region: "indonesia" },
  { slug: "bbc-business", name: "BBC Business", region: "global" },
  { slug: "techcrunch", name: "TechCrunch", region: "global" },
  { slug: "conversation-id", name: "The Conversation Indonesia", region: "indonesia" },
  { slug: "ecb", name: "European Central Bank", region: "global" },
];

export const headlines = {
  newest: "Global AI chipmakers expand capacity as demand stays strong",
  twoHours: "Pemerintah perinci insentif pajak untuk pusat data domestik",
  markup: `<img src=x onerror="window.__pwned=1"> <b>bold</b> & "quotes"`,
  markupSnippet: "<script>window.__pwned=1</script> and <a href=\"javascript:window.__pwned=1\">link</a>",
  long: `Superkalifragilistikekspialidosiusperdagangan${"Mahapanjang".repeat(24)}`,
  yesterday: "Berita kemarin yang tidak dihitung hari ini",
  conversation: "Mengapa harga beras terus naik di pasar tradisional",
  ecb: "ECB keeps interest rates unchanged",
};

export type FixtureArticle = {
  source: string;
  region: FixtureRegion;
  category: FixtureCategory;
  headline: string;
  snippet: string;
  /** Unique, stored in the link: https://example.com/e2e/<path> */
  path: string;
  publishedAt: Date;
  /** Published on the WIB day before today: not part of "today". */
  yesterday?: boolean;
};

const MIN = 60_000;

/** Midnight (WIB) that starts the WIB calendar day of `now`. */
export function wibDayStart(now: Date): Date {
  const day = new Date(now.getTime() + 7 * 60 * MIN).toISOString().slice(0, 10);
  return new Date(`${day}T00:00:00+07:00`);
}

/**
 * The fixture articles, with times relative to `now`. A time that would fall
 * before today's WIB midnight is moved to one minute after it, so every
 * "today" article stays in today (the ordering is then only by id).
 */
export function fixtureArticles(now = new Date()): FixtureArticle[] {
  const start = wibDayStart(now).getTime();
  const list: FixtureArticle[] = [];
  const add = (
    source: string,
    region: FixtureRegion,
    category: FixtureCategory,
    headline: string,
    ageMin: number,
    snippet = `Snippet of: ${headline.slice(0, 40)}`,
  ) =>
    list.push({
      source,
      region,
      category,
      headline,
      snippet,
      path: `${category}/${region}/${list.length}`,
      publishedAt: new Date(Math.max(now.getTime() - ageMin * MIN, start + MIN)),
    });

  // Tech & AI + Global: exactly 30 (no "Load more"); the newest article overall is 5 minutes old.
  add("techcrunch", "global", "tech-ai", headlines.newest, 5);
  for (let i = 1; i <= 29; i++) {
    add(i % 2 ? "techcrunch" : "bbc-business", "global", "tech-ai", `AI infrastructure update ${i}`, 6 + i);
  }
  // Markets + Indonesia: exactly 31 ("Load more" shows one more item).
  for (let i = 1; i <= 31; i++) {
    add(i % 2 ? "cnbc-indonesia" : "antara", "indonesia", "markets", `IHSG ditutup pada sesi ${i}`, 40 + i);
  }
  // The other pairs. Commodities + Global stays empty on purpose.
  add("kemendag", "indonesia", "business", headlines.long, 30, "Snippet with a very long headline and source name.");
  add("antara", "indonesia", "business", "UMKM digital tumbuh di luar Jawa", 80);
  add("bbc-business", "global", "business", headlines.markup, 20, headlines.markupSnippet);
  add("bbc-business", "global", "business", "Shipping costs ease on Asia routes", 85);
  add("antara", "indonesia", "politics", "Aturan sertifikasi halal diperluas", 90);
  add("antara", "indonesia", "politics", headlines.twoHours, 120);
  add("bbc-business", "global", "politics", "New tariff round announced between major economies", 95);
  add("techcrunch", "global", "politics", "Regulators agree on AI safety reporting", 100);
  add("cnbc-indonesia", "indonesia", "tech-ai", "Bank adopsi asisten AI untuk layanan nasabah", 105);
  add("antara", "indonesia", "tech-ai", "Startup AI lokal rilis model bahasa Indonesia", 110);
  add("bbc-business", "global", "markets", "Stocks edge higher ahead of rate decision", 115);
  add("techcrunch", "global", "markets", "Bond yields rise on strong jobs data", 118);
  add("cnbc-indonesia", "indonesia", "commodities", "Harga nikel naik setelah pembatasan ekspor", 119);
  add("antara", "indonesia", "commodities", "Harga emas Antam cetak rekor baru", 117);
  // Licensed sources: they carry a credit line (and The Conversation its licence link).
  add("conversation-id", "indonesia", "politics", headlines.conversation, 121, "Ringkasan yang dipakai apa adanya.");
  add("ecb", "global", "markets", headlines.ecb, 125, "The Governing Council kept the key rates unchanged.");
  // Yesterday (WIB): stored, but never listed or counted.
  list.push({
    source: "antara",
    region: "indonesia",
    category: "commodities",
    headline: headlines.yesterday,
    snippet: "Dari hari sebelumnya.",
    path: "yesterday",
    publishedAt: new Date(start - 60 * MIN),
    yesterday: true,
  });
  return list;
}

/** What the header says: articles stored for today and sources with at least one of them. */
export function todayStats(articles = fixtureArticles()) {
  const today = articles.filter((a) => !a.yesterday);
  return { articles: today.length, sources: new Set(today.map((a) => a.source)).size };
}
