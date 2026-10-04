// Deterministic Opportunities data for the browser tests. Pure data (no database access):
// scripts/e2e-db.ts stores it, e2e/opportunities.spec.ts reads the expectations from it.
// History is [days ago, overall score] pairs; the score of day 0 is the current one.

export type FixtureOpportunity = {
  key: string;
  title: { en: string; id: string };
  thesis: { en: string; id: string };
  region: "indonesia" | "global";
  sectors: string[];
  horizon: "0-6m" | "6-12m" | "1-3y";
  capital: "low" | "medium" | "high";
  history: [number, number][];
  /** Closed this many days ago: never listed. */
  closedDaysAgo?: number;
  /** Keys of `evidenceArticles`, or of the News fixture articles with a `key`, this opportunity cites. */
  cites?: string[];
  /** Replaces parts of the detail text (see detailOf). */
  detail?: Partial<DetailText>;
};

type Pair = { en: string; id: string };
type Lists = { en: string[]; id: string[] };
/** The text of the detail that the list does not show. */
export type DetailText = { capitalReason: Pair; buyer: Pair; model: Pair; risks: Lists; steps: Lists; related: Pair | null };

/** The detail text of a fixture: derived from its key unless the fixture overrides a part. */
export function detailOf(f: FixtureOpportunity): DetailText {
  return {
    capitalReason: { en: `Reason of ${f.key}`, id: `Alasan ${f.key}` },
    buyer: { en: `Buyers of ${f.key}`, id: `Pembeli ${f.key}` },
    model: { en: `Model of ${f.key}`, id: `Model ${f.key}` },
    risks: { en: [`Risk one of ${f.key}`, `Risk two of ${f.key}`], id: [`Risiko satu ${f.key}`, `Risiko dua ${f.key}`] },
    steps: { en: [`Step one of ${f.key}`, `Step two of ${f.key}`], id: [`Langkah satu ${f.key}`, `Langkah dua ${f.key}`] },
    related: null,
    ...f.detail,
  };
}

/** The five factor scores of a score row: the overall score with a fixed spread, so the bars differ (always 0 to 100). */
export function factorsOf(overall: number) {
  const at = (shift: number) => Math.min(100, Math.max(0, overall + shift));
  return { demand: at(0), timing: at(-4), competition: at(3), capital: at(-8), regulatory: at(5) };
}

/** An article that opportunities cite. Stored with the News fixtures, on a day before today (so News counts are unchanged). */
export type FixtureEvidence = { key: string; source: string; headline: string; snippet: string; ageDays: number };

export const longEvidenceHeadline = `Superpanjang${"Berita".repeat(16)}Rantai`; // 108 characters with no space

export const evidenceArticles: FixtureEvidence[] = [
  { key: "antara", source: "antara", headline: "Pemerintah dorong rantai dingin untuk perikanan", snippet: "Snippet one.", ageDays: 1 },
  { key: "conversation", source: "conversation-id", headline: "Mengapa ikan segar cepat busuk di perjalanan", snippet: "Ringkasan yang dipakai apa adanya.", ageDays: 3 },
  { key: "ecb", source: "ecb", headline: "ECB signals steady rates for the year", snippet: "The Governing Council kept the key rates unchanged.", ageDays: 6 },
  { key: "off", source: "katadata", headline: "Katadata: sewa panel surya naik", snippet: "Snippet of a source that is switched off.", ageDays: 4 },
  { key: "markup", source: "bbc-business", headline: `<img src=x onerror="window.__pwned=1"> <b>Bold</b> & "quotes"`, snippet: "<script>window.__pwned=1</script>", ageDays: 8 },
  { key: "long", source: "kemendag", headline: longEvidenceHeadline, snippet: "Snippet of the long one.", ageDays: 10 },
];

// 79 characters with no space (the title limit is 90): it must wrap inside a 390 px screen.
export const longTitle = `Ultra${"Panjang".repeat(10)}Marketplace`;
export const markupTitle = `<img src=x onerror="window.__pwned=1"> <b>Bold</b> & "quotes"`;
export const markupThesis = `<script>window.__pwned=1</script> and <a href="javascript:window.__pwned=1">link</a>`;

const o = (
  key: string,
  en: string,
  id: string,
  region: FixtureOpportunity["region"],
  sectors: string[],
  horizon: FixtureOpportunity["horizon"],
  capital: FixtureOpportunity["capital"],
  history: [number, number][],
  extra: Partial<FixtureOpportunity> = {},
): FixtureOpportunity => ({
  key,
  title: { en, id },
  thesis: { en: `Thesis of ${en}`, id: `Tesis dari ${id}` },
  region,
  sectors,
  horizon,
  capital,
  history,
  ...extra,
});

/**
 * Ordered by id (the order they are stored in). By score the open ones read:
 * 82, 78, 75, 71, 66 (climate), 66 (bootcamps; a tie, so id order), 60, 55, 50, 45.
 */
export const fixtureOpportunities: FixtureOpportunity[] = [
  o("cold-chain", "Cold-chain logistics for fish farmers", "Logistik rantai dingin untuk pembudidaya ikan", "indonesia", ["logistics", "fisheries_maritime"], "0-6m", "low", [[45, 60], [30, 70], [0, 82]], {
    cites: ["ecb", "antara", "conversation"], // stored out of order: shown newest first
    detail: { related: { en: "IDX logistics stocks", id: "Saham logistik IDX" } },
  }), // ▲ 12
  o("solar", "Rooftop solar leasing for factories", "Sewa panel surya atap untuk pabrik", "indonesia", ["renewables_climate"], "6-12m", "high", [[45, 90], [30, 85], [0, 78]], { cites: ["off", "antara", "markup"] }), // ▼ 7
  o("assistant", "AI assistant for online shops", "Asisten AI untuk toko online", "global", ["ai_software", "retail_ecommerce"], "0-6m", "low", [[45, 75], [30, 75], [0, 75]]), // — 0
  o("tax", "Tax tool for online sellers", "Alat pajak untuk penjual online", "indonesia", ["retail_ecommerce", "fintech_finance"], "0-6m", "low", [[30, 62], [0, 71]], { cites: ["tariff"] }), // first scored 30 days ago: ▲ 9
  o("climate", "Climate-resilient farming services", "Layanan pertanian tahan iklim", "indonesia", ["agri_food"], "6-12m", "medium", [[29, 58], [0, 66]], { cites: ["coldchain"] }), // first scored 29 days ago: New
  o("bootcamp", "Digital skills bootcamps", "Bootcamp keterampilan digital", "indonesia", ["education"], "6-12m", "low", [[3, 60], [0, 66]], { cites: ["coldchain"] }), // first scored 3 days ago: New
  o("last-mile", "Last-mile delivery for rural areas", "Pengiriman jarak terakhir untuk desa", "indonesia", ["logistics"], "6-12m", "medium", [[10, 50], [0, 60]], { cites: ["gold"] }), // New
  o("quake", "Earthquake and flood resilience", "Ketahanan gempa dan banjir", "indonesia", ["property_construction", "govtech_public"], "1-3y", "high", [[45, 62], [30, 60], [0, 55]], { cites: ["tariff"] }), // ▼ 5
  o("long", longTitle, longTitle, "global", ["logistics", "ai_software"], "1-3y", "medium", [[45, 40], [30, 45], [0, 50]], {
    cites: ["long", "antara"],
    detail: {
      capitalReason: { en: longTitle, id: longTitle },
      buyer: { en: longTitle, id: longTitle },
      model: { en: longTitle, id: longTitle },
      risks: { en: [longTitle, "Risk two"], id: [longTitle, "Risiko dua"] },
      steps: { en: [longTitle], id: [longTitle] },
      related: { en: longTitle, id: longTitle },
    },
  }), // ▲ 5
  o("markup", markupTitle, markupTitle, "global", ["media_creative"], "0-6m", "low", [[0, 45]], {
    thesis: { en: markupThesis, id: markupThesis },
    cites: ["markup"],
    detail: {
      buyer: { en: markupTitle, id: markupTitle },
      risks: { en: [markupThesis, markupTitle], id: [markupThesis, markupTitle] },
    },
  }), // New
  o("closed", "Closed opportunity that must not be listed", "Peluang tertutup yang tidak boleh tampil", "indonesia", ["logistics"], "0-6m", "low", [[40, 90], [10, 99]], { closedDaysAgo: 10, cites: ["tariff", "rupiah"] }),
];

export const openFixtures = () => fixtureOpportunities.filter((f) => f.closedDaysAgo === undefined);

/** The open ones in the order the screen lists them: score highest first, ties by id. */
export const listedFixtures = () =>
  openFixtures()
    .map((f, index) => ({ f, index, score: f.history.at(-1)![1] }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ f }) => f);
