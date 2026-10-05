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
  // OR-21: triaged (impact, why), untriaged and failed-triage items.
  tariff: "New tariff exemptions speed up data centre builds in Southeast Asia",
  rupiah: "Dollar strength weighs on emerging-market currencies",
  gold: "Gold holds steady as trade talks continue",
  coldChain: "Startup rantai dingin gandeng nelayan di Jawa Timur",
  failed: "Port delays ripple through Asian supply chains",
};

/** What triage stored for an article (saveTriage also moves its category to `category`). */
export type FixtureTriage =
  | {
      status: "ok";
      /** The AI's category: shown instead of the feed category of the article. */
      category: FixtureCategory;
      impact: "opportunity" | "risk" | "context";
      whyEn: string;
      whyId: string;
      /** Theme ids of docs/opportunities/scoring-v1.md section 8. */
      themes: string[];
    }
  | { status: "failed" };

export type FixtureArticle = {
  /** Lets an opportunity fixture cite this article (see FixtureOpportunity.cites). */
  key?: string;
  triage?: FixtureTriage;
  /** Published this many WIB days before today (at noon): stored for the themes panel, not part of "today". */
  daysAgo?: number;
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
    extra: Pick<FixtureArticle, "key" | "triage"> = {},
  ) =>
    list.push({
      ...extra,
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
  add("bbc-business", "global", "business", headlines.markup, 20, headlines.markupSnippet, { key: "markup-news" });
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
  add("conversation-id", "indonesia", "politics", headlines.conversation, 121, "Ringkasan yang dipakai apa adanya.", {
    key: "licensed", // the venture fixtures (OR-51) match and cite it
    triage: {
      status: "ok",
      category: "politics",
      impact: "context",
      whyEn: "Rice prices shape food costs for every household and for small food businesses.",
      whyId: "Harga beras memengaruhi biaya pangan setiap rumah tangga dan usaha makanan kecil.",
      themes: ["food_security", "other"],
    },
  });
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

  // OR-21, appended after the rest so the counts above stay. Times: just behind the newest article, so
  // they show on the first page; each pair (category + region) holds no more than 4 items.
  // A: the feed said business, triage says politics (the triage category is shown and filtered on).
  add("bbc-business", "global", "business", headlines.tariff, 7, undefined, {
    key: "tariff",
    triage: {
      status: "ok",
      category: "politics",
      impact: "opportunity",
      whyEn: "Lower import costs speed up builds, so suppliers of cooling and power win.",
      whyId: "Biaya impor yang lebih rendah mempercepat pembangunan, sehingga pemasok pendingin dan listrik diuntungkan.",
      themes: ["data_centers", "ai_adoption", "trade_tariffs"],
    },
  });
  // B: triage agrees with the feed category.
  add("techcrunch", "global", "markets", headlines.rupiah, 8, undefined, {
    key: "rupiah",
    triage: {
      status: "ok",
      category: "markets",
      impact: "risk",
      whyEn: "Importers lose margin when the dollar rises.",
      whyId: "Importir kehilangan margin ketika dolar menguat.",
      themes: ["rupiah_fx", "other"],
    },
  });
  add("bbc-business", "global", "business", headlines.gold, 9, undefined, {
    key: "gold",
    triage: {
      status: "ok",
      category: "business",
      impact: "context",
      whyEn: "Background for anyone pricing gold or cross-border trade.",
      whyId: "Latar belakang bagi yang menghitung harga emas atau perdagangan lintas negara.",
      themes: ["trade_tariffs", "gold_commodities"],
    },
  });
  // Not triaged yet, but an open opportunity cites it.
  add("cnbc-indonesia", "indonesia", "tech-ai", headlines.coldChain, 10, undefined, { key: "coldchain" });
  // Triage failed: it keeps its feed category and shows no tag.
  add("bbc-business", "global", "business", headlines.failed, 11, undefined, { key: "failed", triage: { status: "failed" } });
  // Triaged articles of the days before today: they only count in the themes panel (7 WIB days, today included).
  const earlier = (daysAgo: number, themes: string[]) =>
    list.push({
      source: "bbc-business",
      region: "global",
      category: "business",
      headline: `Earlier article ${list.length}`,
      snippet: "Stored for the trending themes only.",
      path: `earlier/${daysAgo}/${list.length}`,
      publishedAt: new Date(start - daysAgo * 24 * 60 * MIN + 12 * 60 * MIN),
      daysAgo,
      triage: { status: "ok", category: "business", impact: "context", whyEn: "Why.", whyId: "Mengapa.", themes },
    });
  earlier(1, ["data_centers", "ai_adoption", "other"]);
  earlier(2, ["data_centers", "rupiah_fx", "food_security"]);
  earlier(3, ["data_centers", "trade_tariffs", "other"]);
  earlier(4, ["rupiah_fx", "interest_rates", "other"]);
  earlier(5, ["ai_adoption", "other"]);
  earlier(6, ["data_centers", "ai_adoption", "gold_commodities"]); // the first day of the window
  earlier(7, ["interest_rates", "food_security", "other"]); // just outside: it would change the order if counted
  return list;
}

/**
 * The trending themes the panel must show with these fixtures: today's and the earlier triaged articles,
 * `other` left out, most articles first, ties by theme id, the top 6 (the 7th, interest_rates, is cut).
 */
export const expectedThemes = [
  { theme: "data_centers", count: 5 },
  { theme: "ai_adoption", count: 4 },
  { theme: "rupiah_fx", count: 3 },
  { theme: "trade_tariffs", count: 3 },
  { theme: "food_security", count: 2 },
  { theme: "gold_commodities", count: 2 },
] as const;

/** What the header says: articles stored for today and sources with at least one of them. */
export function todayStats(articles = fixtureArticles()) {
  const today = articles.filter((a) => !a.yesterday && a.daysAgo === undefined);
  return { articles: today.length, sources: new Set(today.map((a) => a.source)).size };
}
