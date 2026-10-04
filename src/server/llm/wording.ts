// "Describe, never instruct" (D10, rules-v1 §7.4, OR-63): the one place that
// holds the banned wording for every AI-written text, in EN and ID. A hit is a
// contract violation where each output is checked (one retry, then nothing is
// stored). Two lists are built from this file:
// - general: all AI text (brief, triage why, opportunity text, venture winds).
//   Advice addressed to the reader and buy/sell instructions; bare "must",
//   "harus", "wajib" stay allowed so regulation can be described, and
//   opportunity first steps may be imperative.
// - signal: signal explanations (OR-33): the general list plus §7.4's list.
// Entries are regular-expression fragments, matched case-insensitively as whole
// words; a space matches any run of whitespace.

const ACTIONS = "buy|sell|invest|hold|accumulate|beli|jual|membeli|menjual|investasi|tahan|akumulasi";
const FORECAST_VERBS = "rise|fall|drop|surge|soar|crash|increase|decrease|jump|plunge";
const MARKET_WORDS = "prices?|stocks?|shares?|gold|silver|crypto|bitcoin|markets?|returns|value|harga|saham|emas|perak|kripto|pasar";

const GENERAL = [
  // EN: advice addressed to the reader, instructions, promises.
  "you should", "you must", "you need to", "we recommend", "recommend(?:s|ed|ing)?", "advis(?:e|es|ed)", "advised to",
  "buy now", "sell now", "act now", "follow the signals?", "good time to", "take profit", "taking profit", "stop loss",
  "your portfolio", "guaranteed", "target price", "don't miss", "consider (?:buying|selling)", "ought to",
  "time to (?:buy|sell)", "now is the time", "buy the dip", "risk-free", "(?:can't|cannot) lose",
  // EN: should / must / need to followed within two words by a buy/sell verb ("Investors should buy bank stocks").
  `(?:should|must|need to|harus|sebaiknya|perlu)(?: \\S+){0,2}? (?:${ACTIONS})`,
  // EN: an unhedged price forecast, only with a price or market word within the three words before "will",
  // so announced policy can be reported ("VAT will increase to 12% from January").
  `(?:${MARKET_WORDS})(?: \\S+){0,2}? will (?:${FORECAST_VERBS})`,
  // ID
  "Anda harus", "Anda sebaiknya", "sebaiknya Anda", "kami sarankan", "disarankan", "Anda perlu", "Anda wajib",
  "beli sekarang", "jual sekarang", "segera beli", "segera jual", "ikuti sinyal", "waktu yang tepat untuk",
  "ambil untung", "dijamin", "pasti naik", "pasti turun", "target harga", "jangan lewatkan", "portofolio Anda",
  "layak dibeli", "layak dijual", "saatnya (?:membeli|menjual|beli|jual)", "tanpa risiko",
];

const SIGNAL_ONLY = [
  // rules-v1 §7.4, EN
  "should", "must", "avoid", "avoided", "core of", "only a small", "buy in \\d+ (?:parts|steps)",
  `will (?:${FORECAST_VERBS})`,
  // rules-v1 §7.4, ID
  "sebaiknya", "harus", "wajib", "hindari", "inti dari", "porsi kecil saja",
];

export type WordingList = "general" | "signal";

const build = (entries: string[]) =>
  entries.map((e) => ({
    entry: e,
    pattern: new RegExp(`(?<![\\p{L}\\p{N}])${e.replace(/ /g, "\\s+")}(?![\\p{L}\\p{N}])`, "iu"),
  }));
const LISTS: Record<WordingList, ReturnType<typeof build>> = { general: build(GENERAL), signal: build([...GENERAL, ...SIGNAL_ONLY]) };

/** The banned wording found in `text`, or null. Curly apostrophes count as straight ones. */
export function bannedWording(text: string, list: WordingList = "general"): string | null {
  const normal = text.replace(/[‘’]/g, "'");
  for (const { pattern } of LISTS[list]) {
    const hit = pattern.exec(normal);
    if (hit) return hit[0];
  }
  return null;
}

/** Throws (a contract violation) when any of the texts has banned wording; `what` names the field. */
export function assertDescriptive(texts: Record<string, string>, list: WordingList = "general"): void {
  for (const [what, text] of Object.entries(texts)) {
    const hit = bannedWording(text, list);
    if (hit) throw new Error(`${what}: advice wording "${hit}" (describe, never instruct)`);
  }
}

/** The first banned wording in any string inside `value` (a reply item, scanned deeply), or null. */
export function adviceIn(value: unknown, list: WordingList = "general"): string | null {
  if (typeof value === "string") return bannedWording(value, list);
  if (Array.isArray(value)) {
    for (const v of value) {
      const hit = adviceIn(v, list);
      if (hit) return hit;
    }
    return null;
  }
  if (value && typeof value === "object") return adviceIn(Object.values(value), list);
  return null;
}
