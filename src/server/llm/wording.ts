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
// words on normalised text (see `normalise`); a space matches any run of whitespace.

const ACTIONS = "buy|sell|invest|hold|accumulate|beli|jual|membeli|menjual|investasi|tahan|akumulasi";

// Forecasts (inverted rule, Orchestrator 2026-10-04; refined from the PR 65 and PR 71 reviews, OR-64):
// - a forecast verb after "will" / "would" / "shall" / "gonna" (or "is going to", "set to", "poised to",
//   "bound to", "is likely to"; ID "akan", "bakal"), with up to two filler words between them ("will also
//   rise"), is rejected unless a policy noun is within the four words before it and in the same clause
//   (no comma, semicolon, colon, dash, opening parenthesis, sentence end, line break or clause word
//   between them), so announced policy can be reported ("VAT will increase to 12%") and "The VAT rose.
//   Demand will fall." is still rejected. "could", "may" and "might" are not forecasts here, so risks
//   and conditions stay describable ("prices could fall if the subsidy ends");
// - "expected / forecast / projected / predicted to" (ID "diperkirakan / diprediksi (akan)") + verb
//   passes only with an attribution in the same sentence ("…, according to the ministry"). The guard
//   checks that an attribution is written, not that it is true.
const VERBS_EN =
  "rise|fall|drop|surge|soar|crash|increase|decrease|jump|plunge|weaken|strengthen|climb|slide|rally|rebound|tumble|decline|grow|gain|recover|collapse|spike|sink|go up|go down|hit (?:a )?records?|be higher|be lower|double|halve";
const VERBS_ID =
  "naik|turun|melonjak|anjlok|menguat|melemah|meningkat|menurun|merosot|jatuh|tumbuh|pulih|menanjak|melambung|terapresiasi|terdepresiasi";
// Up to two filler words between the modal and the verb ("will also rise", "akan kembali naik").
const FILLER = "(?: [\\p{L}']+){0,2}?";
const EXPECTED = `(?:(?:(?:is|are) )?(?:expected|forecast|projected|predicted) to${FILLER} (?:${VERBS_EN})|(?:diperkirakan|diprediksi)(?: (?:akan|bakal))?${FILLER} (?:${VERBS_ID}))`;
const FORECAST_EN = `(?:will|would|shall|gonna|(?:is|are) going to|(?:(?:is|are) )?(?:set|poised|bound|likely) to)${FILLER} (?:${VERBS_EN})`;
const FORECAST_ID = `(?:akan|bakal)${FILLER} (?:${VERBS_ID})`;
const ATTRIBUTION = "according to|said|says|announced|reported|menurut|kata|mengatakan|mengumumkan|melaporkan";
const CLAUSE_WORDS = "means|so|that|because|while|and|but|berarti|sehingga|karena|sementara|dan|tetapi";
// "must / harus / wajib + buy / sell / hold / invest" describes a mandate only with an authority word in
// the same sentence ("Pension funds must invest 30% in bonds under the new rule"); otherwise it is advice.
const AUTHORITY =
  "regulations?|rules?|laws?|requirements?|mandates?|OJK|BI|ministry|ministries|authority|authorities|aturan|peraturan|undang undang|kewajiban|kementerian|otoritas";
const MANDATE = `(?:must|harus|wajib)(?: \\S+){0,2}? (?:${ACTIONS})`;
const POLICY_NOUNS = [
  "tax(?:es)?", "VAT", "rules?", "regulations?", "laws?", "fees?", "tariffs?", "duty", "duties", "import duties", "quotas?",
  "subsidy", "subsidies", "ban", "deadline", "permits?", "licen[cs]es?", "levy", "excise", "minimum wage",
  "pajak", "PPN", "tarif", "aturan", "peraturan", "regulasi", "undang undang", "UU", "biaya", "bea", "bea masuk", "cukai",
  "kuota", "subsidi", "larangan", "tenggat", "batas waktu", "izin", "lisensi", "pungutan", "upah minimum", "UMP", "UMR",
];
const POLICY_WINDOW_WORDS = 4;

const GENERAL = [
  // EN: advice addressed to the reader, instructions, promises.
  "you should", "you must", "you need to", "we recommend", "recommend(?:s|ed|ing)?", "advis(?:e|es|ed)", "advised to",
  "buy now", "sell now", "act now", "follow the signals?", "good time to", "take profit", "taking profit", "stop loss",
  "your portfolio", "target price", "don't miss", "consider (?:buying|selling)", "ought to",
  "time to (?:buy|sell)", "now is the time", "buy the dip", "risk free", "(?:can't|cannot) lose",
  // OR-65 (QA's OR-63 report). Suggest: only advice ("we suggest", "suggest buying"); "the data suggest" describes.
  "we suggest", "I suggest", "suggest(?:s|ed)? (?:buying|selling|investing)",
  // Certainty: "make / be sure to" are instructions for a task, not certainty about a price.
  "(?<!(?:make|be)\\s)sure to", "certain to", "guarantee(?:s|d|ing)?", "surefire", "(?:can't|cannot) go wrong", "no brainer",
  // Analyst ratings.
  "strong (?:buy|sell)", "(?:buy|sell) rating", "rated a (?:buy|sell)",
  // should / need to (EN and ID) followed within two words by a buy/sell verb ("Investors should buy bank stocks").
  // "must / harus / wajib" + verb is the mandate check below.
  `(?:should|need to|sebaiknya|perlu)(?: \\S+){0,2}? (?:${ACTIONS})`,
  // ID
  "Anda harus", "Anda sebaiknya", "sebaiknya Anda", "kami sarankan", "disarankan", "Anda perlu", "Anda wajib",
  "beli sekarang", "jual sekarang", "segera beli", "segera jual", "ikuti sinyal", "waktu yang tepat untuk",
  "ambil untung", "dijamin", "pasti naik", "pasti turun", "target harga", "jangan lewatkan", "portofolio Anda",
  "layak dibeli", "layak dijual", "saatnya (?:membeli|menjual|beli|jual)", "tanpa risiko",
  // OR-65: ID recommend in every form (as EN "recommend"), suggest as advice, certainty, ratings.
  "merekomendasikan", "direkomendasikan", "rekomendasikan(?:lah)?", "rekomendasi (?:beli|jual)",
  "kami menyarankan", "saya menyarankan", "menyarankan(?: untuk)? (?:membeli|menjual|beli|jual)",
  "lebih baik (?:beli|jual|membeli|menjual)", "pasti akan", "tidak mungkin rugi", "pasti untung", "peringkat (?:beli|jual)",
];

// OR-65: a buy / sell imperative as the first word of a sentence, in every AI text except opportunity
// first steps (business validation: "Buy a small batch of stock to test demand").
const IMPERATIVES = "buy|sell|hold|invest in|beli|belilah|jual|juallah|tahan|investasikan";

const SIGNAL_ONLY = [
  // rules-v1 §7.4, EN
  "should", "must", "avoid", "avoided", "core of", "only a small", "buy in \\d+ (?:parts|steps)",
  // rules-v1 §7.4, ID
  "sebaiknya", "harus", "wajib", "hindari", "inti dari", "porsi kecil saja",
  // Every mandate and every forecast, policy, authority or sourced or not.
  MANDATE,
  EXPECTED,
  FORECAST_EN,
  FORECAST_ID,
];

export type WordingList = "general" | "signal";

const wholeWords = (e: string) => `(?<![\\p{L}\\p{N}])(?:${e.replace(/ /g, "\\s+")})(?![\\p{L}\\p{N}])`;
// Each entry's id is the entry as written: logged and counted per rejection, so a pattern is visible.
const build = (entries: string[]) => entries.map((e) => ({ id: e.length > 40 ? `${e.slice(0, 37)}...` : e, pattern: new RegExp(wholeWords(e), "iu") }));
const LISTS: Record<WordingList, { id: string; pattern: RegExp }[]> = { general: build(GENERAL), signal: build([...GENERAL, ...SIGNAL_ONLY]) };
// The expected forms come first, so "diperkirakan akan naik" is read as one sourced-expectation form.
const FORECAST = `(${wholeWords(EXPECTED)})|${wholeWords(FORECAST_EN)}|${wholeWords(FORECAST_ID)}`;
const POLICY = new RegExp(wholeWords(POLICY_NOUNS.join("|")), "giu");
const ATTRIBUTED = new RegExp(wholeWords(ATTRIBUTION), "iu");
const AUTHORITY_RE = new RegExp(wholeWords(AUTHORITY), "giu");
const MANDATE_RE = new RegExp(wholeWords(MANDATE), "giu");
const CLAUSE_CHARS = /[,;:()–—]/;
const CLAUSE_WORD_RE = new RegExp(wholeWords(CLAUSE_WORDS), "iu");
// An authority word that is the subject of an attribution ("…, the ministry says") does not make a mandate.
// A fixed list (no part-of-speech tagging), within three words after the authority word (Designer and
// Orchestrator, OR-64): "…, OJK data show" and "…, data OJK menunjukkan" are attributions.
const REPORTING_VERBS =
  "says?|said|states?|stated|announces?|announced|shows?|showed|shown|reports?|reported|notes?|noted|warns?|warned|claims?|claimed|estimates?|estimated|added|told|expects|predicted|kata|mengatakan|menyatakan|mengumumkan|menunjukkan|melaporkan|mencatat|menyebut|menyebutkan|memperingatkan|menilai";
const REPORTING_AFTER = new RegExp(`^(?: [\\p{L}']+){0,2}? (?:${REPORTING_VERBS})(?![\\p{L}])`, "iu");
const REPORTING_BEFORE = /(?:according to|menurut)\s+(?:[\p{L}']+\s+){0,2}$/iu;
// Not a sentence end: a period between digits ("12.5%", "Rp 1.000.000"), inside "U.S.", or after these.
const ABBREVIATION = /(?:^|[^\p{L}])(?:no|u\.s|e\.g|i\.e|mr|mrs|dr|vs|inc|ltd|tbk)$/iu;
// Bounded work on long texts: the policy noun is looked for just before a forecast, a sentence near a hit.
const POLICY_LOOKBACK_CHARS = 100;
const SENTENCE_REACH_CHARS = 400;
const AUTHORITY_REACH_WORDS = 8;

/**
 * One normalisation before matching (OR-64): NFKC (full-width letters), zero-width characters and soft
 * hyphens removed, HTML tags and markdown marks dropped, hyphens and underscores read as spaces, curly
 * apostrophes as straight ones, and runs of spaces collapsed (line breaks are kept: they end a sentence).
 */
export function normalise(text: string): string {
  return text
    // HTML entities first, so "&lt;b&gt;" and "&#115;hould" are read as what they show.
    .replace(/&(?:lt|gt|amp|nbsp|quot|apos|#\d{1,6}|#x[0-9a-f]{1,6});/gi, decodeEntity)
    .normalize("NFKC")
    .replace(/[­​-‍⁠﻿]/g, "")
    // Tags: only the tag name and the brackets go, the words inside stay and are checked
    // ("<b you should buy gold now>" is still caught); linear on any input.
    // A bare inline tag inside a word joins it back ("shou<b>ld</b>" → "should"); a block tag
    // (br, p, div, li) or a tag between words is a space.
    .replace(new RegExp(`<\\/?(?:${TAGS})\\s*\\/?>`, "giu"), (tag, at: number, all: string) =>
      !/^<\/?(?:br|p|div|li|ul|ol)\b/i.test(tag) && /\p{L}/u.test(all[at - 1] ?? "") && /\p{L}/u.test(all[at + tag.length] ?? "") ? "" : " ",
    )
    .replace(new RegExp(`<\\/?(?:${TAGS})\\b`, "gi"), " ")
    .replace(/\/?>/g, " ")
    .replace(/[*`~]/g, "")
    .replace(/[_\-‐‑]/g, " ")
    .replace(/[‘’]/g, "'")
    .replace(/[^\S\n]+/g, " ");
}

const TAGS = "a|b|i|u|s|em|strong|span|p|br|div|sup|sub|small|mark|code|del|ins|font|li|ul|ol";
const ENTITIES: Record<string, string> = { "&lt;": "<", "&gt;": ">", "&amp;": "&", "&nbsp;": " ", "&quot;": '"', "&apos;": "'" };

function decodeEntity(entity: string): string {
  const named = ENTITIES[entity.toLowerCase()];
  if (named) return named;
  const code = entity[2] === "x" || entity[2] === "X" ? parseInt(entity.slice(3, -1), 16) : parseInt(entity.slice(2, -1), 10);
  return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : " ";
}

/** Whether position `i` ends a sentence: `! ?`, a line break, or a period that is not a decimal or an abbreviation. */
function sentenceEndAt(text: string, i: number): boolean {
  const ch = text[i];
  if (ch === "!" || ch === "?" || ch === "\n") return true;
  if (ch !== ".") return false;
  if (/\d/.test(text[i - 1] ?? "") && /\d/.test(text[i + 1] ?? "")) return false;
  if (/\p{L}/u.test(text[i + 1] ?? "")) return false; // "U.S" inside
  return !ABBREVIATION.test(text.slice(Math.max(0, i - 6), i));
}

/** Whether a clause ends anywhere in text[from, to): a sentence end, `, ; : ( ) – —` or a clause word. */
function clauseBreakIn(text: string, from: number, to: number): boolean {
  for (let i = from; i < to; i++) if (CLAUSE_CHARS.test(text[i]) || sentenceEndAt(text, i)) return true;
  return CLAUSE_WORD_RE.test(text.slice(from, to));
}

/** The sentence of `text` around position `at` (looked for within a bounded reach). */
function sentenceAt(text: string, at: number): { start: number; end: number } {
  let start = at;
  while (start > 0 && at - start < SENTENCE_REACH_CHARS && !sentenceEndAt(text, start - 1)) start--;
  let end = at;
  while (end < text.length && end - at < SENTENCE_REACH_CHARS && !sentenceEndAt(text, end)) end++;
  return { start, end };
}

/** Whether a policy noun is among the four words before position `at`, in the same clause. */
function policyInClause(text: string, at: number): boolean {
  const from = Math.max(0, at - POLICY_LOOKBACK_CHARS);
  const before = text.slice(from, at);
  const words = [...before.matchAll(/\S+/g)];
  const windowStart = from + (words.length > POLICY_WINDOW_WORDS ? words[words.length - POLICY_WINDOW_WORDS].index : 0);
  let last: RegExpExecArray | null = null;
  for (const m of text.slice(windowStart, at).matchAll(POLICY)) last = m;
  return last !== null && !clauseBreakIn(text, windowStart + last.index + last[0].length, at);
}

/** A forecast that is neither announced policy nor an attributed expectation, or null. */
function unhedgedForecast(text: string): string | null {
  for (const hit of text.matchAll(new RegExp(FORECAST, "giu"))) {
    if (policyInClause(text, hit.index)) continue; // announced policy
    const { start, end } = sentenceAt(text, hit.index);
    if (hit[1] && ATTRIBUTED.test(text.slice(start, end))) continue; // an attributed expectation
    return hit[0];
  }
  return null;
}

/**
 * Whether a mandate ("must invest …") has an authority word within eight words on either side, in the same
 * sentence (commas allowed), that is not the subject of an attribution (Orchestrator, OR-64): "Under the new
 * regulation, funds must invest 30% in bonds" and "… must invest 30% in bonds under the new rule" pass;
 * "Investors must buy gold, the ministry says" does not.
 */
function hasAuthority(text: string, hitStart: number, hitEnd: number): boolean {
  const { start, end } = sentenceAt(text, hitStart);
  const before = [...text.slice(start, hitStart).matchAll(/\S+/g)];
  const after = [...text.slice(hitEnd, end).matchAll(/\S+/g)];
  const from = start + (before.length > AUTHORITY_REACH_WORDS ? before[before.length - AUTHORITY_REACH_WORDS].index : 0);
  const to = after.length > AUTHORITY_REACH_WORDS ? hitEnd + after[AUTHORITY_REACH_WORDS - 1].index + after[AUTHORITY_REACH_WORDS - 1][0].length : end;
  for (const m of text.slice(from, to).matchAll(AUTHORITY_RE)) {
    const at = from + m.index;
    if (REPORTING_AFTER.test(text.slice(at + m[0].length, at + m[0].length + 60))) continue; // "the ministry says"
    if (REPORTING_BEFORE.test(text.slice(Math.max(0, at - 40), at))) continue; // "according to the ministry"
    return true;
  }
  return false;
}

const IMPERATIVE_RE = new RegExp(wholeWords(IMPERATIVES), "giu");

/** A buy / sell imperative that starts a sentence (the text's start, or after a sentence end), or null. */
function imperativeStart(text: string): string | null {
  for (const hit of text.matchAll(IMPERATIVE_RE)) {
    let i = hit.index - 1;
    while (i >= 0 && text[i] === " ") i--;
    if (i < 0 || sentenceEndAt(text, i)) return hit[0];
  }
  return null;
}

/** A mandate without an authority word near it, or null. */
function unmandated(text: string): string | null {
  for (const hit of text.matchAll(MANDATE_RE)) if (!hasAuthority(text, hit.index, hit.index + hit[0].length)) return hit[0];
  return null;
}

/** What matched: the list entry's id (logged and counted; never the text itself) and the matched words. */
export type WordingHit = { id: string; match: string };

/** The first banned wording in `text` (after `normalise`), or null. */
/** Where a text sits: opportunity first steps may start with an imperative (OR-65). */
export type WordingContext = { firstStep?: boolean };

export function wordingHit(text: string, list: WordingList = "general", context: WordingContext = {}): WordingHit | null {
  const normal = normalise(text);
  for (const { id, pattern } of LISTS[list]) {
    const hit = pattern.exec(normal);
    if (hit) return { id, match: hit[0] };
  }
  if (!context.firstStep) {
    const imperative = imperativeStart(normal);
    if (imperative) return { id: "imperative", match: imperative };
  }
  if (list === "signal") return null; // the signal list already rejects every mandate and every forecast
  const mandate = unmandated(normal);
  if (mandate) return { id: "mandate", match: mandate };
  const forecast = unhedgedForecast(normal);
  return forecast ? { id: "forecast", match: forecast } : null;
}

/** The banned wording found in `text`, or null. */
export function bannedWording(text: string, list: WordingList = "general"): string | null {
  return wordingHit(text, list)?.match ?? null;
}

/** The message of a wording rejection: the field and the list entry's id, not the text. */
export const wordingReason = (what: string, hit: WordingHit) => `${what}: advice wording (rule "${hit.id}"; describe, never instruct)`;

/** A contract violation of the wording rule, with the list entry that matched. */
export class AdviceError extends Error {
  // A plain field, not a constructor parameter property: the jobs run under Node's type stripping.
  ruleId: string;
  constructor(message: string, ruleId: string) {
    super(message);
    this.ruleId = ruleId;
  }
}

/** Throws an AdviceError when any of the texts has banned wording; `what` names the field. */
export function assertDescriptive(texts: Record<string, string>, list: WordingList = "general", context: WordingContext = {}): void {
  for (const [what, text] of Object.entries(texts)) {
    const hit = wordingHit(text, list, context);
    if (hit) throw new AdviceError(wordingReason(what, hit), hit.id);
  }
}

/** Counts one rejection in a run's counts: `wording_rejected`, and per list entry `wording:<id>` (logged too). */
export function countRejection(counts: Record<string, number>, ruleId: string): void {
  counts.wording_rejected = (counts.wording_rejected ?? 0) + 1;
  counts[`wording:${ruleId}`] = (counts[`wording:${ruleId}`] ?? 0) + 1;
  console.info(`wording: rejected by rule "${ruleId}"`);
}

/** The list entry id named in a rejection message made by `wordingReason`, or null. */
export const ruleIdIn = (message: string) => /advice wording \(rule "([^"]+)"/.exec(message)?.[1] ?? null;

/** Wraps a reply parser so that each advice rejection is counted (the run record shows the rate). */
export function countingAdvice<T, C>(parse: (value: unknown, context: C) => T, counts: Record<string, number>): (value: unknown, context: C) => T {
  return (value, context) => {
    try {
      return parse(value, context);
    } catch (error) {
      if (error instanceof AdviceError) countRejection(counts, error.ruleId);
      throw error;
    }
  };
}

/**
 * The first banned wording in any string inside `value` (a reply item, scanned deeply), or null.
 * Strings under a `firstSteps` key are opportunity first steps (imperatives allowed).
 */
export function adviceIn(value: unknown, list: WordingList = "general", context: WordingContext = {}): WordingHit | null {
  if (typeof value === "string") return wordingHit(value, list, context);
  if (Array.isArray(value)) {
    for (const v of value) {
      const hit = adviceIn(v, list, context);
      if (hit) return hit;
    }
    return null;
  }
  if (value && typeof value === "object") {
    for (const [key, v] of Object.entries(value)) {
      const hit = adviceIn(v, list, key === "firstSteps" ? { firstStep: true } : context);
      if (hit) return hit;
    }
  }
  return null;
}

/** The rule every AI job states in its prompt, so that a retry can pass the guard (OR-63). */
export const WORDING_RULE =
  'Describe, never instruct: no advice to the reader, no buy or sell instructions, no promises. Report a forecast only as an expectation with its source in the same sentence ("is expected to ..., according to ..." / "diperkirakan ..., menurut ..."), never as "will ...", "would ...", "is going to ...", "is set to ...", "akan ..." or "bakal ..." (announced policy, such as "VAT will increase to 12% from January", is fine).';
