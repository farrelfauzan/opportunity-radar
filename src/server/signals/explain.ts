// The signal report (OR-33): the LLM explains a verdict that the rules (OR-29) already decided,
// and reads this week's news about the asset as supportive or against. Every reply is checked in
// code; a reply that states another verdict, names a price that is not one of the rules' reversal
// prices, or gives advice is invalid (one retry, then nothing is stored).
import { readFileSync } from "node:fs";
import {
  articlesForSignals,
  listAssets,
  saveSignalReport,
  signalsToExplain,
  type Asset,
  type Signal,
  type SignalVerdict,
} from "@/server/data";
import type { JobOutcome } from "@/server/jobs/runner";
import { BudgetExhaustedError, callLlm, InvalidOutputError, type LlmCall } from "@/server/llm/client";
import { fenceUntrusted } from "@/server/llm/fence";
import { assertDescriptive, countingAdvice, normalise, WORDING_RULE } from "@/server/llm/wording";
import { newsMatcher } from "./keywords.ts";
import { RULES_VERSION } from "./rules.ts";

const MAX_WORDS = 90;
const MAX_RISKS = 5;
const MAX_RISK_CHARS = 160;
const MAX_ARTICLES = 40;
const REPORT_DAYS = 7; // explained again weekly even without a change, with that week's news
const DAY_MS = 24 * 60 * 60 * 1000;

// The fixed note that starts every report on sample (synthetic) prices (copy §8.2), from the dictionaries.
const dictionary = (lang: "en" | "id") =>
  JSON.parse(readFileSync(new URL(`../../i18n/dictionaries/${lang}.json`, import.meta.url), "utf8")) as { sample: { signalNote: string } };
export const SAMPLE_NOTE = { en: dictionary("en").sample.signalNote, id: dictionary("id").sample.signalNote };

const VERDICT_WORDS: Record<SignalVerdict, { en: string; id: string }> = {
  BUY: { en: "buy", id: "beli" },
  HOLD: { en: "hold", id: "tahan" },
  SELL: { en: "sell", id: "jual" },
};

const SYSTEM = `You explain a rule-based signal for one asset in plain language, for the app's owner. The rules decided the verdict; you never change it.
From the data block write:
- "explanation": {"en": "...", "id": "..."}: one paragraph each (English and Bahasa Indonesia), at most ${MAX_WORDS} words, on what the rules see (the checks and their numbers) and what the week's news adds as context. Name the verdict only as given. Mention a price only if it is one of the "reversalPrices"; no other prices or targets.
- "risks": {"en": [...], "id": [...]}: 1 to ${MAX_RISKS} short risks of this position, the same count in both languages, each at most ${MAX_RISK_CHARS} characters.
- "news": {"supportive": [ids], "against": [ids]}: the article ids from "articles" whose news supports or goes against the verdict; an article in at most one list.
Answer with JSON only: {"explanation": {...}, "risks": {...}, "news": {...}}`;

type Reply = { explanation: { en: string; id: string }; risks: { en: string[]; id: string[] }; news: { supportive: number[]; against: number[] } };

const words = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

/** A verdict word other than the rule's (buy / sell / hold, beli / jual / tahan), or null. */
export function otherVerdict(text: string, verdict: SignalVerdict): string | null {
  const normal = normalise(text);
  for (const [v, w] of Object.entries(VERDICT_WORDS)) {
    if (v === verdict) continue;
    const hit = new RegExp(`(?<![\\p{L}\\p{N}])(?:${w.en}|${w.id})(?![\\p{L}\\p{N}])`, "iu").exec(normal);
    if (hit) return hit[0];
  }
  return null;
}

/** The numbers written in a text, read with the language's separators (EN 1,234.56; ID 1.234,56). */
export function numbersIn(text: string, lang: "en" | "id"): { value: number; percent: boolean }[] {
  const pattern = lang === "en" ? /\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g : /\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?/g;
  return [...text.matchAll(pattern)].map((m) => {
    const raw = lang === "en" ? m[0].replace(/,/g, "") : m[0].replace(/\./g, "").replace(",", ".");
    return { value: Number(raw), percent: /^\s*%/.test(text.slice(m.index + m[0].length)) };
  });
}

/**
 * The price guard: every number must be a reversal price (to the cent, or rounded to the unit), the
 * RSI, a percentage, a count or another small integer (≤ 200: days, the 50 / 200-day averages, 30 / 70)
 * or a year. Anything else could be a price target and is rejected.
 */
export function unexplainedNumber(text: string, lang: "en" | "id", allowed: { prices: number[]; rsi: number | null }): number | null {
  for (const { value, percent } of numbersIn(text, lang)) {
    if (percent) continue;
    if (Number.isInteger(value) && (value <= 200 || (value >= 1990 && value <= 2100))) continue;
    if (allowed.rsi !== null && (Math.abs(value - allowed.rsi) <= 0.01 || value === Math.round(allowed.rsi))) continue;
    if (allowed.prices.some((p) => Math.abs(value - p) <= 0.01 || value === Math.round(p))) continue;
    return value;
  }
  return null;
}

/** The checked reply; throws (so the client retries once) when it breaks a rule. */
export function parseReport(value: unknown, input: { verdict: SignalVerdict; articleIds: ReadonlySet<number>; prices: number[]; rsi: number | null }): Reply {
  const v = value as Record<string, unknown> | null;
  const text = (x: unknown, what: string) => {
    if (typeof x !== "string" || !x.trim()) throw new Error(`${what} is empty`);
    return x.trim();
  };
  const explanation = v?.explanation as Record<string, unknown> | undefined;
  const risks = v?.risks as Record<string, unknown> | undefined;
  const news = v?.news as Record<string, unknown> | undefined;
  const out: Reply = {
    explanation: { en: text(explanation?.en, "explanation.en"), id: text(explanation?.id, "explanation.id") },
    risks: { en: [], id: [] },
    news: { supportive: [], against: [] },
  };
  for (const lang of ["en", "id"] as const) {
    if (words(out.explanation[lang]) > MAX_WORDS) throw new Error(`explanation.${lang} is longer than ${MAX_WORDS} words`);
    const list = risks?.[lang];
    if (!Array.isArray(list) || list.length < 1 || list.length > MAX_RISKS) throw new Error(`risks.${lang} must have 1 to ${MAX_RISKS} items`);
    out.risks[lang] = list.map((r, i) => {
      const t = text(r, `risks.${lang}[${i}]`);
      if (Array.from(t).length > MAX_RISK_CHARS) throw new Error(`risks.${lang}[${i}] is longer than ${MAX_RISK_CHARS} characters`);
      return t;
    });
  }
  if (out.risks.en.length !== out.risks.id.length) throw new Error("risks must have the same count in EN and ID");
  for (const side of ["supportive", "against"] as const) {
    const ids = news?.[side];
    if (!Array.isArray(ids) || !ids.every((id) => Number.isInteger(id) && input.articleIds.has(id as number))) {
      throw new Error(`news.${side} must list article ids from the input`);
    }
    out.news[side] = [...new Set(ids as number[])];
  }
  if (out.news.supportive.some((id) => out.news.against.includes(id))) throw new Error("an article is both supportive and against");

  // The verdict comes from the rules: no other verdict word, and only the rules' reversal prices.
  for (const lang of ["en", "id"] as const) {
    for (const [what, t] of [[`explanation.${lang}`, out.explanation[lang]], ...out.risks[lang].map((r, i) => [`risks.${lang}[${i}]`, r])] as [string, string][]) {
      const other = otherVerdict(t, input.verdict);
      if (other) throw new Error(`${what}: states another verdict ("${other}"; the rules say ${input.verdict})`);
      const number = unexplainedNumber(t, lang, input);
      if (number !== null) throw new Error(`${what}: the number ${number} is not one of the rules' prices`);
    }
  }
  // Describe, never instruct: OR-63's shared guard, with the strict signal list.
  assertDescriptive(
    Object.fromEntries([
      ["explanation.en", out.explanation.en],
      ["explanation.id", out.explanation.id],
      ...out.risks.en.map((r, i) => [`risks.en[${i}]`, r]),
      ...out.risks.id.map((r, i) => [`risks.id[${i}]`, r]),
    ]),
    "signal",
  );
  return out;
}

const classOf = (asset: Asset) => (asset.kind === "crypto" ? "crypto" : asset.kind === "metal" ? "metal" : "stock");

async function explain(
  signal: Signal,
  asset: Asset,
  news: Awaited<ReturnType<typeof articlesForSignals>>,
  counts: Record<string, number>,
  transport: LlmCall<unknown>["fetch"] | undefined,
  now: Date,
) {
  const verdict = signal.state as SignalVerdict;
  const matches = newsMatcher(asset);
  const matched = news.filter((a) => matches({ headline: a.headline, themes: a.themes })).slice(0, MAX_ARTICLES);
  const prices = signal.reversals.flatMap((r) => [r.stays, r.at]).filter((p): p is number => typeof p === "number");
  const rsi = signal.indicators?.rsi ?? null;
  const fence = fenceUntrusted("SIGNAL", {
    asset: { name: asset.name, symbol: asset.symbol, kind: classOf(asset), currency: asset.currency },
    term: signal.term,
    verdict,
    indicators: signal.indicators,
    checks: signal.checks,
    reversalPrices: prices,
    currency: signal.currency,
    articles: matched.map((a) => ({ id: a.id, headline: a.headline, why: a.why, impact: a.impact })),
  });
  const reply = await callLlm({
    job: "explanations",
    role: "report",
    messages: [
      { role: "system", content: `${SYSTEM}\n${WORDING_RULE}\n${fence.rule}` },
      { role: "user", content: `Explain the ${signal.term}-term ${verdict} signal of ${asset.name}.\n${fence.block}` },
    ],
    parse: countingAdvice((value) => parseReport(value, { verdict, articleIds: new Set(matched.map((a) => a.id)), prices, rsi }), counts),
    maxTokens: 1500,
    fetch: transport,
  });
  // A report on sample prices starts with the fixed note (copy §8.2), in both languages.
  const lead = (lang: "en" | "id") => (signal.synthetic ? `${SAMPLE_NOTE[lang]} ` : "");
  await saveSignalReport({
    assetId: signal.assetId,
    term: signal.term,
    verdict,
    explanationEn: `${lead("en")}${reply.explanation.en}`,
    explanationId: `${lead("id")}${reply.explanation.id}`,
    risksEn: reply.risks.en,
    risksId: reply.risks.id,
    newsSupportive: reply.news.supportive,
    newsAgainst: reply.news.against,
    newsTotal: matched.length,
    rulesVersion: RULES_VERSION,
    synthetic: signal.synthetic,
    generatedAt: now,
  });
}

export async function writeSignalReports(options: { transport?: LlmCall<unknown>["fetch"]; now?: () => Date } = {}): Promise<JobOutcome> {
  const now = options.now?.() ?? new Date();
  const due = await signalsToExplain(new Date(now.getTime() - REPORT_DAYS * DAY_MS));
  const counts: Record<string, number> = { due: due.length, written: 0, rejected: 0, wording_rejected: 0 };
  if (due.length === 0) return { status: "ok", counts };
  const assets = new Map((await listAssets()).map((a) => [a.id, a]));
  const news = await articlesForSignals(new Date(now.getTime() - REPORT_DAYS * DAY_MS));
  const reasons: string[] = [];
  for (const signal of due) {
    const asset = assets.get(signal.assetId)!;
    try {
      await explain(signal, asset, news, counts, options.transport, now);
      counts.written++;
    } catch (error) {
      if (error instanceof BudgetExhaustedError) {
        return { status: "partial", counts, error: `${error.message}; ${counts.written} reports written before the cap` };
      }
      if (!(error instanceof InvalidOutputError)) throw error;
      counts.rejected++;
      reasons.push(`${asset.slug} ${signal.term}: ${error.message}`.slice(0, 200));
    }
  }
  return reasons.length ? { status: "partial", counts, error: `${reasons.length} rejected: ${reasons.join("; ")}` } : { status: "ok", counts };
}
