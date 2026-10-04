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
};

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
  o("cold-chain", "Cold-chain logistics for fish farmers", "Logistik rantai dingin untuk pembudidaya ikan", "indonesia", ["logistics", "fisheries_maritime"], "0-6m", "low", [[45, 60], [30, 70], [0, 82]]), // ▲ 12
  o("solar", "Rooftop solar leasing for factories", "Sewa panel surya atap untuk pabrik", "indonesia", ["renewables_climate"], "6-12m", "high", [[45, 90], [30, 85], [0, 78]]), // ▼ 7
  o("assistant", "AI assistant for online shops", "Asisten AI untuk toko online", "global", ["ai_software", "retail_ecommerce"], "0-6m", "low", [[45, 75], [30, 75], [0, 75]]), // — 0
  o("tax", "Tax tool for online sellers", "Alat pajak untuk penjual online", "indonesia", ["retail_ecommerce", "fintech_finance"], "0-6m", "low", [[30, 62], [0, 71]]), // first scored 30 days ago: ▲ 9
  o("climate", "Climate-resilient farming services", "Layanan pertanian tahan iklim", "indonesia", ["agri_food"], "6-12m", "medium", [[29, 58], [0, 66]]), // first scored 29 days ago: New
  o("bootcamp", "Digital skills bootcamps", "Bootcamp keterampilan digital", "indonesia", ["education"], "6-12m", "low", [[3, 60], [0, 66]]), // first scored 3 days ago: New
  o("last-mile", "Last-mile delivery for rural areas", "Pengiriman jarak terakhir untuk desa", "indonesia", ["logistics"], "6-12m", "medium", [[10, 50], [0, 60]]), // New
  o("quake", "Earthquake and flood resilience", "Ketahanan gempa dan banjir", "indonesia", ["property_construction", "govtech_public"], "1-3y", "high", [[45, 62], [30, 60], [0, 55]]), // ▼ 5
  o("long", longTitle, longTitle, "global", ["logistics", "ai_software"], "1-3y", "medium", [[45, 40], [30, 45], [0, 50]]), // ▲ 5
  o("markup", markupTitle, markupTitle, "global", ["media_creative"], "0-6m", "low", [[0, 45]], {
    thesis: { en: markupThesis, id: markupThesis },
  }), // New
  o("closed", "Closed opportunity that must not be listed", "Peluang tertutup yang tidak boleh tampil", "indonesia", ["logistics"], "0-6m", "low", [[40, 90], [10, 99]], { closedDaysAgo: 10 }),
];

export const openFixtures = () => fixtureOpportunities.filter((f) => f.closedDaysAgo === undefined);

/** The open ones in the order the screen lists them: score highest first, ties by id. */
export const listedFixtures = () =>
  openFixtures()
    .map((f, index) => ({ f, index, score: f.history.at(-1)![1] }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ f }) => f);
