// Deterministic Radar data for the browser tests: the daily brief of today. Pure data (no database
// access): scripts/e2e-db.ts stores it, e2e/radar.spec.ts reads the expectations from it.
// The lines cite fixtures by key: opportunities (e2e/opportunity-fixtures.ts) and evidence articles.

export type FixtureBriefLine = {
  label: "business" | "politics" | "tech-ai" | "markets" | "commodities";
  en: string;
  id: string;
  opportunities: string[];
  articles: string[];
};

export const briefInjection = `<script>window.__pwned=1</script> & "quotes"`;

export const fixtureBriefLines: FixtureBriefLine[] = [
  {
    label: "politics",
    en: "Cold-chain support widens the window for fish-farm logistics.",
    id: "Dukungan rantai dingin memperluas peluang logistik budidaya ikan.",
    opportunities: ["cold-chain", "solar"],
    articles: ["antara", "conversation"],
  },
  {
    label: "tech-ai",
    en: `Tooling prices fell again ${briefInjection}`,
    id: `Harga perangkat turun lagi ${briefInjection}`,
    opportunities: ["cold-chain"],
    articles: ["markup"],
  },
  {
    label: "markets",
    en: "Steady interest rates keep financing costs predictable.",
    id: "Suku bunga stabil menjaga biaya pembiayaan tetap terduga.",
    opportunities: [],
    articles: ["ecb"],
  },
];
