// Daily re-score (OR-16): every open opportunity with new evidence since its
// last score gets five factor scores from the LLM, with the rubric of
// scoring-v1 §2 as the anchor and its cited articles as evidence. The overall
// score is computed in code. Out-of-range output is rejected (retried once),
// and then yesterday's score simply stays current.
import { FACTOR_KEYS, opportunitiesToRescore, recordOpportunityScore, wibDay, type FactorScores } from "@/server/data";
import type { JobOutcome } from "@/server/jobs/runner";
import { BudgetExhaustedError, callLlm, InvalidOutputError, type LlmCall } from "@/server/llm/client";
import { assertDescriptive, countingAdvice, WORDING_RULE } from "@/server/llm/wording";
import { fenceUntrusted } from "@/server/llm/fence";
import { overallScore } from "./generate.ts";

const MAX_PER_RUN = 50;
const MAX_TOKENS = 1500;

const SYSTEM = `You score one business opportunity on five factors, each an integer 0-100 where higher is always better:
- demand: 0 = no sign anyone wants it; 50 = clear need in one segment, mixed signals; 100 = documented unmet demand at scale in several sources
- timing: 0 = window closed or more than 3 years away; 50 = trend emerging, window 12-24 months; 100 = trigger in the last 90 days, window within 6 months. If authorities act to reverse the trigger, at most 60; if they reinforce it, at least 60
- competition (low competition): 0 = dominated by funded incumbents or free substitutes (government programmes, NGO services and free public tools count); 50 = several players, none dominant locally; 100 = no local player or only informal sellers
- capital (capital efficiency): 0 = more than Rp 5 bn or 24 months before first revenue; 50 = about Rp 500 m, 6-12 months; 100 = under Rp 50 m, first revenue within 3 months
- regulatory (low regulatory risk): 0 = a licence or ban is likely to block it; 50 = a licence is needed but obtainable; 100 = unregulated or explicitly supported
Interpolate between anchors. Give each a one-sentence reason in English and Bahasa Indonesia (at most 200 characters each) that cites at least one article.
Answer with JSON only: {"factors": {"demand": {"score": 0, "reason": {"en": "", "id": ""}}, "timing": ..., "competition": ..., "capital": ..., "regulatory": ...}}`;

/** {"factors": {...}} with exactly the five factors, integer scores 0-100 and non-empty reasons; else throws. */
export function parseFactors(value: unknown): FactorScores {
  const factors = (value as { factors?: Record<string, unknown> } | null)?.factors;
  if (!factors || typeof factors !== "object") throw new Error('expected {"factors": {...}}');
  const keys = Object.keys(factors);
  if (keys.length !== FACTOR_KEYS.length || !FACTOR_KEYS.every((k) => keys.includes(k))) {
    throw new Error(`factors must be exactly ${FACTOR_KEYS.join(", ")}`);
  }
  const exactly = (value: unknown, allowed: string[], path: string) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${path} must be an object`);
    const extra = Object.keys(value).filter((k) => !allowed.includes(k));
    if (extra.length) throw new Error(`${path}: unexpected ${extra.join(", ")}`);
  };
  exactly(value, ["factors"], "reply");
  const scores = {} as FactorScores;
  for (const key of FACTOR_KEYS) {
    exactly(factors[key], ["score", "reason"], key);
    exactly((factors[key] as { reason?: unknown }).reason, ["en", "id"], `${key}.reason`);
    const factor = factors[key] as { score?: unknown; reason?: { en?: unknown; id?: unknown } } | null;
    const score = factor?.score;
    if (typeof score !== "number" || !Number.isInteger(score) || score < 0 || score > 100) {
      throw new Error(`${key}: score must be an integer 0-100, got ${JSON.stringify(score)}`);
    }
    for (const lang of ["en", "id"] as const) {
      const reason = factor?.reason?.[lang];
      if (typeof reason !== "string" || !reason.trim() || Array.from(reason).length > 200) {
        throw new Error(`${key}: reason.${lang} must be 1-200 characters`);
      }
      assertDescriptive({ [`${key}: reason.${lang}`]: reason }); // describe, never instruct (OR-63)
    }
    scores[key] = score;
  }
  return scores;
}

export async function scoreOpportunities(
  options: { transport?: LlmCall<unknown>["fetch"]; now?: () => Date } = {},
): Promise<JobOutcome> {
  const now = options.now?.() ?? new Date();
  const today = wibDay(now);
  const due = await opportunitiesToRescore(today, MAX_PER_RUN);
  const counts: Record<string, number> = { due: due.length, scored: 0, rejected: 0, skipped: 0, wording_rejected: 0 };
  const reasons: string[] = [];
  for (const o of due) {
    // A score must rest on evidence: never ask without cited articles (all may be from switched-off sources).
    if (o.articles.length === 0) {
      counts.skipped++;
      console.warn(`scores: #${o.id} not re-scored: no visible cited article`);
      continue;
    }
    const fence = fenceUntrusted("EVIDENCE", {
      opportunity: { title: o.titleEn, thesis: o.thesisEn, theme: o.theme, region: o.region, sectors: o.sectors, horizon: o.horizon, capital: o.capitalLevel },
      articles: o.articles.map((a) => ({ id: String(a.id), headline: a.headline, snippet: a.snippet, why: a.why })),
    });
    let factors: FactorScores;
    try {
      factors = await callLlm({
        job: "scores",
        role: "report",
        messages: [
          { role: "system", content: `${SYSTEM}\n${WORDING_RULE}\n${fence.rule}` },
          { role: "user", content: `Score this opportunity on today's evidence.\n${fence.block}` },
        ],
        parse: countingAdvice(parseFactors, counts),
        maxTokens: MAX_TOKENS,
        fetch: options.transport,
      });
    } catch (error) {
      if (error instanceof BudgetExhaustedError) {
        // Stop, but keep what this run did: scored ones are stored, the rest waits for next month's budget.
        return { status: "partial", counts, error: `${error.message}; ${counts.scored} scored before the cap` };
      }
      if (!(error instanceof InvalidOutputError)) throw error; // settings, provider down: stop the run
      counts.rejected++;
      reasons.push(`#${o.id}: ${error.message}`.slice(0, 200));
      console.warn(`scores: #${o.id} not re-scored, yesterday's score stays: ${error.message}`);
      continue;
    }
    const overall = overallScore(Object.fromEntries(FACTOR_KEYS.map((k) => [k, { score: factors[k] }])) as Parameters<typeof overallScore>[0]);
    await recordOpportunityScore(o.id, { day: today, overall, ...factors });
    counts.scored++;
  }
  return reasons.length ? { status: "partial", counts, error: `${reasons.length} rejected: ${reasons.join("; ")}` } : { status: "ok", counts };
}
