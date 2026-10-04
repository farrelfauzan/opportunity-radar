// Seed set for development and QA (OR-9): 66 articles with times relative to
// now, covering every category and both regions, with the edge cases QA asked for.
import type { Category, NewSource, Region } from "../src/server/data/index.ts";
import { FEEDS } from "../src/server/news/feeds.ts";

const MIN = 60_000;
const HOUR = 60 * MIN;

// The real feed list, so seeded and ingested articles share the same sources.
export const seedSources: NewSource[] = FEEDS;

export type SeedArticle = {
  source: string;
  region: Region;
  category: Category;
  headline: string;
  snippet: string;
  path: string;
  publishedAt: Date;
};

const item = (
  source: string,
  region: Region,
  category: Category,
  headline: string,
  ageMs: number,
  now: number,
  snippet = "Seed article for local development and QA. Not a real news item.",
): SeedArticle => ({
  source,
  region,
  category,
  headline,
  snippet,
  path: `${category}/${region}/${headline.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60)}`,
  publishedAt: new Date(now - ageMs),
});

export function seedArticles(now = Date.now()): SeedArticle[] {
  const list: SeedArticle[] = [];

  // 32 Global "Tech & AI" articles, 20 minutes apart: one filter with more than 30 items.
  for (let i = 1; i <= 32; i++) {
    list.push(
      item(i % 2 ? "techcrunch" : "bbc-technology", "global", "tech-ai", `AI infrastructure update ${i}`, i * 20 * MIN, now),
    );
  }

  // Every other category and region pair gets a few articles, except
  // Commodities + Global, which stays empty on purpose (empty state).
  const pairs: [string, Region, Category, string[]][] = [
    ["antara", "indonesia", "business", ["UMKM digital tumbuh di luar Jawa", "Ekspor furnitur naik pada kuartal ketiga", "Pemerintah siapkan insentif kawasan industri", "Startup logistik raih pendanaan baru"]],
    ["bbc-business", "global", "business", ["Retailers report slower holiday orders", "Shipping costs ease on Asia routes", "Airlines add capacity to Southeast Asia", "Factory output steadies in major economies"]],
    ["cnn-indonesia", "indonesia", "politics", ["DPR bahas aturan baru pusat data", "Aturan sertifikasi halal diperluas", "Pemerintah revisi aturan impor", "Daerah percepat perizinan usaha"]],
    ["the-guardian", "global", "politics", ["New tariff round announced between major economies", "Regulators agree on AI safety reporting", "Trade talks resume after a pause", "Carbon border rules enter a new phase"]],
    ["katadata", "indonesia", "tech-ai", ["Operator pusat data tambah kapasitas di Batam", "Bank adopsi asisten AI untuk layanan nasabah", "Startup AI lokal rilis model bahasa Indonesia", "Investasi cloud di Indonesia meningkat"]],
    ["cnbc-indonesia", "indonesia", "markets", ["IHSG ditutup menguat tipis", "Rupiah melemah terhadap dolar AS", "Saham perbankan pimpin penguatan", "Investor asing catat beli bersih"]],
    ["cnbc", "global", "markets", ["Stocks edge higher ahead of rate decision", "Bond yields rise on strong jobs data", "Dollar firms against Asian currencies", "Tech shares lead a late rally"]],
    ["idx-channel", "indonesia", "commodities", ["Harga nikel naik setelah pembatasan ekspor", "Harga emas Antam cetak rekor baru", "Produksi batu bara turun pada September", "Harga CPO menguat di awal pekan"]],
  ];
  // Ages: 5 minutes, 2 hours, 23 hours and yesterday (26 hours).
  const ages = [5 * MIN, 2 * HOUR, 23 * HOUR, 26 * HOUR];
  for (const [source, region, category, headlines] of pairs) {
    headlines.forEach((headline, i) => list.push(item(source, region, category, headline, ages[i], now)));
  }

  // Edge cases.
  list.push(
    item("bbc-business", "global", "business", "Article dated one hour in the future", -HOUR, now),
    item(
      "the-guardian",
      "global",
      "business",
      'Markup must show as text: <b>bold</b> <script>alert("x")</script> & "quotes"',
      3 * HOUR,
      now,
      'Snippet with markup: <img src=x onerror=alert(1)> <a href="javascript:alert(1)">link</a>',
    ),
  );

  return list;
}
