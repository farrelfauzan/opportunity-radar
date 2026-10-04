// Opportunity generation (OR-15): the LLM groups the last 7 days of relevant,
// triaged news into themes and writes one opportunity per theme, citing the
// articles it used. Each opportunity is checked against the OR-11 contract;
// one that breaks it is rejected and logged, and nothing is stored for it.
// A theme that matches an open opportunity updates it instead (OR-50), and
// opportunities without new evidence for 30 days are closed.
import {
  closeStaleOpportunities,
  FACTOR_KEYS,
  MAX_CITATIONS as MAX_STORED_CITATIONS,
  insertOpportunity,
  listOpenForMatching,
  opportunityCandidates,
  refreshOpportunity,
  wibDay,
  type FactorScores,
  type NewOpportunity,
} from "@/server/data";
import type { JobOutcome } from "@/server/jobs/runner";
import { callLlm, type LlmCall } from "@/server/llm/client";
import { fenceUntrusted } from "@/server/llm/fence";
import { adviceIn, countRejection, ruleIdIn, WORDING_RULE, wordingReason } from "@/server/llm/wording";
import { checkOpportunity, type OpportunityOutput } from "./contract.ts";
import { findMatch } from "./match.ts";

const WINDOW_DAYS = 7;
const MAX_INPUT_ARTICLES = 150;
// The data block's size budget: with the instructions it stays under the LLM
// client's 200,000-character input guard even when every article is long.
const MAX_DATA_CHARS = 150_000;
const MAX_REASON_CHARS = 200;
const MAX_OPPORTUNITIES = 10; // per run
const MAX_CITATIONS = 20; // used from one reply item (an opportunity stores at most MAX_STORED_CITATIONS in total)
const MAX_TOKENS = 8000;

/** Overall score (scoring-v1 §1): the equal-weight mean of the five factors, Math.round, computed in code. */
export function overallScore(factors: Record<keyof FactorScores, { score: number }>): number {
  return Math.round(FACTOR_KEYS.reduce((sum, key) => sum + factors[key].score, 0) / FACTOR_KEYS.length);
}

const SYSTEM = `You find business opportunities in Indonesian and global news for a small business owner.
Group the articles in the data block into themes (a theme needs at least 2 articles) and write one opportunity per theme, at most ${MAX_OPPORTUNITIES}.
Answer with JSON only, exactly {"opportunities": [ ... ]}, where each item has:
- "title" {"en","id"} up to 90 characters; "thesis" {"en","id"} up to 400 characters
- "region": "indonesia" or "global"; "theme": one theme id from the articles' themes (never "other")
- "sectors": 1 to 3 ids from: agri_food, fisheries_maritime, energy_mining, renewables_climate, manufacturing, logistics, retail_ecommerce, fintech_finance, health_biotech, education, property_construction, tourism_hospitality, media_creative, telecom_infra, ai_software, hardware_electronics, govtech_public, consumer_services
- "horizon": "0-6m", "6-12m" or "1-3y"
- "capital": {"level": "low" (< Rp 100 m), "medium" (< Rp 1 bn) or "high", "reason": {"en","id"} up to 120 characters}
- "buyer", "model": {"en","id"} up to 120 characters each
- "risks": 2 to 5 items, "firstSteps": 1 to 5 items, each {"en","id"} up to 160 characters
- "factors": {"demand","timing","competition","capital","regulatory"}, each {"score": integer 0-100, "reason": {"en","id"} up to 200 characters}. Higher is always better (low competition, capital efficiency, low regulatory risk score high).
- "citations": the ids (as strings) of at least 2 articles from the data block that support it
Every text is given in English ("en") and Bahasa Indonesia ("id").`;

type Candidate = Awaited<ReturnType<typeof opportunityCandidates>>[number];

/** What the LLM sees of one article (untrusted text, fenced). */
const inputItem = ({ article, triage }: Candidate) => ({
  id: String(article.id),
  headline: article.headline,
  snippet: article.snippet,
  region: article.region,
  category: article.category,
  why: triage.whyEn,
  themes: triage.themes,
});

function toFields(o: OpportunityOutput): NewOpportunity {
  return {
    titleEn: o.title.en,
    titleId: o.title.id,
    thesisEn: o.thesis.en,
    thesisId: o.thesis.id,
    region: o.region,
    theme: o.theme,
    sectors: o.sectors,
    horizon: o.horizon,
    capitalLevel: o.capital.level,
    capitalReasonEn: o.capital.reason.en,
    capitalReasonId: o.capital.reason.id,
    buyerEn: o.buyer.en,
    buyerId: o.buyer.id,
    modelEn: o.model.en,
    modelId: o.model.id,
    risksEn: o.risks.map((r) => r.en),
    risksId: o.risks.map((r) => r.id),
    firstStepsEn: o.firstSteps.map((s) => s.en),
    firstStepsId: o.firstSteps.map((s) => s.id),
  };
}

/**
 * The reply's shape: {"opportunities": [...]}. Anything else is invalid output (retried once).
 * Advice wording in the first reply also asks for the retry; in the retry's reply only the
 * items with it are rejected (the contract checks every text), the others are stored.
 */
function envelopeParser(counts: Record<string, number>): (value: unknown, context: { attempt: number }) => unknown[] {
  return (value, { attempt }) => {
    const items = (value as { opportunities?: unknown } | null)?.opportunities;
    if (!Array.isArray(items)) throw new Error('expected {"opportunities": [...]}');
    const advice = attempt === 1 ? adviceIn(items) : null;
    if (advice) {
      countRejection(counts, advice.id);
      throw new Error(wordingReason("reply", advice));
    }
    return items;
  };
}

export async function generateOpportunities(
  options: { transport?: LlmCall<unknown>["fetch"]; now?: () => Date } = {},
): Promise<JobOutcome> {
  const now = options.now?.() ?? new Date();
  const since = new Date(now.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
  // Most relevant first (newest on ties), at most 150 and only as many as fit the size budget.
  const ranked = (await opportunityCandidates(since)).sort(
    (a, b) => (b.triage.relevance ?? 0) - (a.triage.relevance ?? 0) || b.article.publishedAt.getTime() - a.article.publishedAt.getTime(),
  );
  const candidates: Candidate[] = [];
  let size = 2;
  for (const c of ranked.slice(0, MAX_INPUT_ARTICLES)) {
    const itemSize = JSON.stringify(inputItem(c)).length + 1;
    if (size + itemSize > MAX_DATA_CHARS) break;
    candidates.push(c);
    size += itemSize;
  }
  const counts: Record<string, number> = { candidates: candidates.length, candidates_available: ranked.length, created: 0, matched: 0, rejected: 0, closed: 0, citations_skipped: 0, wording_rejected: 0 };
  const closeStale = async () => {
    const closed = await closeStaleOpportunities(now);
    counts.closed = closed.length;
    for (const id of closed) console.info(`opportunities: closed #${id} (no new evidence for 30 days)`);
  };
  console.info(`opportunities: ${candidates.length} of ${ranked.length} candidates used`);
  // Nothing to judge by (no news, a dead ingestion or triage job, a machine that was off):
  // no call, and nothing is closed, since a closed opportunity is never reopened.
  if (candidates.length < 2) return { status: "ok", counts }; // no theme can have 2 citations

  const fence = fenceUntrusted("ARTICLES", candidates.map(inputItem));
  const items = await callLlm({
    job: "opportunities",
    role: "report",
    messages: [
      { role: "system", content: `${SYSTEM}\n${WORDING_RULE}\n${fence.rule}` },
      { role: "user", content: `Find the opportunities in these ${candidates.length} articles.\n${fence.block}` },
    ],
    parse: envelopeParser(counts),
    maxTokens: MAX_TOKENS,
    fetch: options.transport,
  });

  const inputIds = new Set(candidates.map(({ article }) => String(article.id)));
  const reasons: string[] = [];
  const open = await listOpenForMatching();
  if (items.length > MAX_OPPORTUNITIES) {
    console.warn(`opportunities: reply has ${items.length} items; only the first ${MAX_OPPORTUNITIES} are used`);
  }
  for (const [index, raw] of items.slice(0, MAX_OPPORTUNITIES).entries()) {
    const checked = checkOpportunity(raw, inputIds);
    if (!checked.ok) {
      counts.rejected++;
      const ruleId = ruleIdIn(checked.reason);
      if (ruleId) countRejection(counts, ruleId);
      const reason = checked.reason.slice(0, MAX_REASON_CHARS);
      reasons.push(`#${index + 1}: ${reason}`);
      console.warn(`opportunities: rejected #${index + 1}: ${reason}`);
      continue;
    }
    const o = checked.value;
    const citations = o.citations.slice(0, MAX_CITATIONS).map(Number);
    const match = findMatch({ theme: o.theme, region: o.region, sectors: o.sectors, citations }, open);
    if (match) {
      // Same opportunity: it keeps its id, gains the new citations and fresh texts. Re-scoring is OR-16's.
      const { theme: _t, region: _r, sectors: _s, ...refreshed } = toFields(o);
      void [_t, _r, _s];
      // The text is replaced only when the theme is the same and the item cites an article the
      // opportunity already cites (Designer, OR-50); otherwise only the citations are added.
      const known = open.find((x) => x.id === match.id)!;
      const refreshText = known.theme === o.theme && citations.some((c) => known.citations.includes(c));
      const { added, skipped } = await refreshOpportunity(match.id, refreshText ? refreshed : null, citations);
      counts.citations_skipped += skipped;
      known.citations = [...new Set([...known.citations, ...citations])];
      counts.matched++;
      console.info(
        `opportunities: theme ${o.theme}/${o.region} → matched #${match.id} (${match.reason}; ${refreshText ? "text refreshed" : "citations only"}; ${added} new citations` +
          (skipped ? `, ${skipped} left out at the ${MAX_STORED_CITATIONS}-citation limit)` : ")"),
      );
      continue;
    }
    const factors = Object.fromEntries(FACTOR_KEYS.map((key) => [key, o.factors[key].score])) as FactorScores;
    const created = await insertOpportunity(toFields(o), { day: wibDay(now), overall: overallScore(o.factors), ...factors }, citations);
    open.push({ id: created.id, theme: o.theme, region: o.region, sectors: o.sectors, citations });
    counts.created++;
    console.info(`opportunities: theme ${o.theme}/${o.region} → new #${created.id} (no open opportunity matches)`);
  }
  await closeStale();
  return reasons.length
    ? { status: "partial", counts, error: `${reasons.length} rejected: ${reasons.join("; ")}` }
    : { status: "ok", counts };
}
