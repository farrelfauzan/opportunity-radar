// "Describe, never instruct" (D10, rules-v1 §7.4, OR-63): the one place that
// holds the banned wording for every AI-written text, in EN and ID. A hit is a
// contract violation where each output is checked (one retry, then nothing is
// stored). Two lists are built from this file:
// - general: all AI text (brief, triage why, opportunity text and factor
//   reasons, venture winds). Advice addressed to the reader, buy/sell
//   instructions and forecasts; bare "must", "harus", "wajib" stay allowed so
//   regulation can be described, and opportunity first steps may be imperative.
// - signal: signal explanations (OR-33): the general list plus §7.4's list.
// Entries are regular-expression fragments, matched case-insensitively as whole
// words; a space matches any run of whitespace.

const ACTIONS = "buy|sell|invest|hold|accumulate|beli|jual|membeli|menjual|investasi|tahan|akumulasi";

// Forecasts (inverted rule, Orchestrator 2026-10-04; refined by the Designer from the PR 65 review):
// - a forecast verb after "will" (or "is going to", "set to", "poised to", "bound to", "is likely to";
//   ID "akan", "bakal") is rejected unless a policy noun is within the four words before it and in the
//   same clause (no comma, semicolon or clause word between them), so announced policy can be reported
//   ("VAT will increase to 12%") and "The VAT rise means demand will fall" is still rejected;
// - "expected / forecast / projected / predicted to" (ID "diperkirakan / diprediksi (akan)") + verb
//   passes only with an attribution in the same sentence ("…, according to the ministry"). The guard
//   checks that an attribution is written, not that it is true.
const VERBS_EN =
  "rise|fall|drop|surge|soar|crash|increase|decrease|jump|plunge|weaken|strengthen|climb|slide|rally|rebound|tumble|decline|grow|gain|recover|collapse|spike|sink";
const VERBS_ID = "naik|turun|melonjak|anjlok|menguat|melemah|meningkat|menurun|merosot|jatuh|tumbuh|pulih";
const EXPECTED = `(?:(?:(?:is|are) )?(?:expected|forecast|projected|predicted) to (?:${VERBS_EN})|(?:diperkirakan|diprediksi)(?: (?:akan|bakal))? (?:${VERBS_ID}))`;
const FORECAST_EN = `(?:will(?: (?:likely|probably|certainly|continue to))?|(?:is|are) going to|(?:(?:is|are) )?(?:set|poised|bound|likely) to) (?:${VERBS_EN})`;
const FORECAST_ID = `(?:akan|bakal)(?: (?:terus|segera))? (?:${VERBS_ID})`;
const ATTRIBUTION = "according to|said|says|announced|reported|menurut|kata|mengatakan|mengumumkan|melaporkan";
const CLAUSE_WORDS = "means|so|that|because|while|and|but|berarti|sehingga|karena|sementara|dan|tetapi";
const POLICY_NOUNS = [
  "tax(?:es)?", "VAT", "rules?", "regulations?", "laws?", "fees?", "tariffs?", "duty", "duties", "import duties", "quotas?",
  "subsidy", "subsidies", "ban", "deadline", "permits?", "licen[cs]es?", "levy", "excise", "minimum wage",
  "pajak", "PPN", "tarif", "aturan", "peraturan", "regulasi", "undang-undang", "UU", "biaya", "bea", "bea masuk", "cukai",
  "kuota", "subsidi", "larangan", "tenggat", "batas waktu", "izin", "lisensi", "pungutan", "upah minimum", "UMP", "UMR",
];
const POLICY_WINDOW_WORDS = 4;

const GENERAL = [
  // EN: advice addressed to the reader, instructions, promises.
  "you should", "you must", "you need to", "we recommend", "recommend(?:s|ed|ing)?", "advis(?:e|es|ed)", "advised to",
  "buy now", "sell now", "act now", "follow the signals?", "good time to", "take profit", "taking profit", "stop loss",
  "your portfolio", "guaranteed", "target price", "don't miss", "consider (?:buying|selling)", "ought to",
  "time to (?:buy|sell)", "now is the time", "buy the dip", "risk-free", "(?:can't|cannot) lose",
  // should / must / need to (EN and ID) followed within two words by a buy/sell verb ("Investors should buy bank stocks").
  `(?:should|must|need to|harus|sebaiknya|perlu)(?: \\S+){0,2}? (?:${ACTIONS})`,
  // ID
  "Anda harus", "Anda sebaiknya", "sebaiknya Anda", "kami sarankan", "disarankan", "Anda perlu", "Anda wajib",
  "beli sekarang", "jual sekarang", "segera beli", "segera jual", "ikuti sinyal", "waktu yang tepat untuk",
  "ambil untung", "dijamin", "pasti naik", "pasti turun", "target harga", "jangan lewatkan", "portofolio Anda",
  "layak dibeli", "layak dijual", "saatnya (?:membeli|menjual|beli|jual)", "tanpa risiko",
];

const SIGNAL_ONLY = [
  // rules-v1 §7.4, EN
  "should", "must", "avoid", "avoided", "core of", "only a small", "buy in \\d+ (?:parts|steps)",
  // rules-v1 §7.4, ID
  "sebaiknya", "harus", "wajib", "hindari", "inti dari", "porsi kecil saja",
  // Every forecast, policy or sourced or not.
  EXPECTED,
  FORECAST_EN,
  FORECAST_ID,
];

export type WordingList = "general" | "signal";

const wholeWords = (e: string) => `(?<![\\p{L}\\p{N}])(?:${e.replace(/ /g, "\\s+")})(?![\\p{L}\\p{N}])`;
const build = (entries: string[]) => entries.map((e) => new RegExp(wholeWords(e), "iu"));
const LISTS: Record<WordingList, RegExp[]> = { general: build(GENERAL), signal: build([...GENERAL, ...SIGNAL_ONLY]) };
// The expected forms come first, so "diperkirakan akan naik" is read as one sourced-expectation form.
const FORECAST = `(${wholeWords(EXPECTED)})|${wholeWords(FORECAST_EN)}|${wholeWords(FORECAST_ID)}`;
const POLICY = new RegExp(wholeWords(POLICY_NOUNS.join("|")), "giu");
const ATTRIBUTED = new RegExp(wholeWords(ATTRIBUTION), "iu");
const CLAUSE_BREAK = new RegExp(`[,;]|${wholeWords(CLAUSE_WORDS)}`, "iu");

/** The sentence of `text` around position `at`. */
function sentenceAt(text: string, at: number): string {
  const start = Math.max(text.lastIndexOf(". ", at), text.lastIndexOf("! ", at), text.lastIndexOf("? ", at)) + 1;
  const ends = [". ", "! ", "? "].map((e) => text.indexOf(e, at)).filter((i) => i >= 0);
  return text.slice(start, ends.length ? Math.min(...ends) + 1 : text.length);
}

/** Whether a policy noun is among the last four words of `before`, with no clause break after it. */
function policyInClause(before: string): boolean {
  const window = before.split(/\s+/).filter(Boolean).slice(-POLICY_WINDOW_WORDS).join(" ");
  let last: RegExpExecArray | null = null;
  for (const m of window.matchAll(POLICY)) last = m;
  return last !== null && !CLAUSE_BREAK.test(window.slice(last.index + last[0].length));
}

/** A forecast that is neither announced policy nor an attributed expectation, or null. */
function unhedgedForecast(text: string): string | null {
  for (const hit of text.matchAll(new RegExp(FORECAST, "giu"))) {
    if (policyInClause(text.slice(0, hit.index))) continue; // announced policy
    if (hit[1] && ATTRIBUTED.test(sentenceAt(text, hit.index))) continue; // an attributed expectation
    return hit[0];
  }
  return null;
}

/** The banned wording found in `text`, or null. Curly apostrophes count as straight ones. */
export function bannedWording(text: string, list: WordingList = "general"): string | null {
  const normal = text.replace(/[‘’]/g, "'");
  for (const pattern of LISTS[list]) {
    const hit = pattern.exec(normal);
    if (hit) return hit[0];
  }
  return list === "general" ? unhedgedForecast(normal) : null; // the signal list already rejects every forecast
}

/** A contract violation of the wording rule (counted per job run as `wording_rejected`). */
export class AdviceError extends Error {}

/** Throws an AdviceError when any of the texts has banned wording; `what` names the field. */
export function assertDescriptive(texts: Record<string, string>, list: WordingList = "general"): void {
  for (const [what, text] of Object.entries(texts)) {
    const hit = bannedWording(text, list);
    if (hit) throw new AdviceError(`${what}: advice wording "${hit}" (describe, never instruct)`);
  }
}

/** Wraps a reply parser so that each advice rejection is counted (the run record shows the rate). */
export function countingAdvice<T>(parse: (value: unknown) => T, counts: { wording_rejected: number }): (value: unknown) => T {
  return (value) => {
    try {
      return parse(value);
    } catch (error) {
      if (error instanceof AdviceError) counts.wording_rejected++;
      throw error;
    }
  };
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

/** The rule every AI job states in its prompt, so that a retry can pass the guard (OR-63). */
export const WORDING_RULE =
  'Describe, never instruct: no advice to the reader, no buy or sell instructions, no promises. Report a forecast only as an expectation with its source in the same sentence ("is expected to ..., according to ..." / "diperkirakan ..., menurut ..."), never as "will ...", "is going to ...", "is set to ...", "akan ..." or "bakal ..." (announced policy, such as a tax that will rise, is fine).';
