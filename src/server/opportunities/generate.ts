// Opportunity generation (OR-15): the LLM groups the last 7 days of relevant,
// triaged news into themes and writes one opportunity per theme, citing the
// articles it used. Each opportunity is checked against the OR-11 contract;
// one that breaks it is rejected and logged, and nothing is stored for it.
// Matching to existing opportunities, updating and closing are OR-50.
import { FACTOR_KEYS, insertOpportunity, opportunityCandidates, wibDay, type FactorScores, type NewOpportunity } from "@/server/data";
import type { JobOutcome } from "@/server/jobs/runner";
import { callLlm, type LlmCall } from "@/server/llm/client";
import { fenceUntrusted } from "@/server/llm/fence";
import { checkOpportunity, type OpportunityOutput } from "./contract.ts";

const WINDOW_DAYS = 7;
const MAX_INPUT_ARTICLES = 150; // newest first; keeps the prompt well under the client's input guard
const MAX_OPPORTUNITIES = 10; // per run
const MAX_CITATIONS = 20; // stored per opportunity
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

/** The reply's shape: {"opportunities": [...]}. Anything else is invalid output (retried once). */
function parseEnvelope(value: unknown): unknown[] {
  const items = (value as { opportunities?: unknown } | null)?.opportunities;
  if (!Array.isArray(items)) throw new Error('expected {"opportunities": [...]}');
  return items;
}

export async function generateOpportunities(
  options: { transport?: LlmCall<unknown>["fetch"]; now?: () => Date } = {},
): Promise<JobOutcome> {
  const now = options.now?.() ?? new Date();
  const since = new Date(now.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const candidates: Candidate[] = (await opportunityCandidates(since)).slice(0, MAX_INPUT_ARTICLES);
  const counts = { candidates: candidates.length, created: 0, rejected: 0 };
  if (candidates.length < 2) return { status: "ok", counts }; // no theme can have 2 citations

  const fence = fenceUntrusted(
    "ARTICLES",
    candidates.map(({ article, triage }) => ({
      id: String(article.id),
      headline: article.headline,
      snippet: article.snippet,
      region: article.region,
      category: article.category,
      why: triage.whyEn,
      themes: triage.themes,
    })),
  );
  const items = await callLlm({
    job: "opportunities",
    role: "report",
    messages: [
      { role: "system", content: `${SYSTEM}\n${fence.rule}` },
      { role: "user", content: `Find the opportunities in these ${candidates.length} articles.\n${fence.block}` },
    ],
    parse: parseEnvelope,
    maxTokens: MAX_TOKENS,
    fetch: options.transport,
  });

  const inputIds = new Set(candidates.map(({ article }) => String(article.id)));
  const reasons: string[] = [];
  for (const [index, raw] of items.slice(0, MAX_OPPORTUNITIES).entries()) {
    const checked = checkOpportunity(raw, inputIds);
    if (!checked.ok) {
      counts.rejected++;
      reasons.push(`#${index + 1}: ${checked.reason}`);
      console.warn(`opportunities: rejected #${index + 1}: ${checked.reason}`);
      continue;
    }
    const o = checked.value;
    const factors = Object.fromEntries(FACTOR_KEYS.map((key) => [key, o.factors[key].score])) as FactorScores;
    await insertOpportunity(
      toFields(o),
      { day: wibDay(now), overall: overallScore(o.factors), ...factors },
      o.citations.slice(0, MAX_CITATIONS).map(Number),
    );
    counts.created++;
  }
  return reasons.length
    ? { status: "partial", counts, error: `${reasons.length} rejected: ${reasons.join("; ")}` }
    : { status: "ok", counts };
}
