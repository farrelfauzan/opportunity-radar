// Venture market view (OR-38), a morning step after scoring: for each of the
// owner's ventures, the news of the last 30 days matched by its keywords is
// rated for relevance by the LLM, which also scores the market for Indonesia
// and worldwide (the OR-11 rubric) and writes one tailwind and one headwind,
// each citing articles. Scores are computed in code; nothing is invented when
// there is no related news.
import {
  FACTOR_KEYS,
  listVentures,
  saveVentureView,
  ventureNewsCandidates,
  wibDay,
  type FactorScores,
  type Venture,
  type VentureMarketInput,
} from "@/server/data";
import type { JobOutcome } from "@/server/jobs/runner";
import { BudgetExhaustedError, callLlm, InvalidOutputError, type LlmCall } from "@/server/llm/client";
import { fenceUntrusted } from "@/server/llm/fence";
import { overallScore } from "@/server/opportunities/generate";
import { keywordMatcher } from "./match.ts";

const WINDOW_DAYS = 30;
const MAX_CANDIDATES = 60;
const MIN_RELEVANCE = 50; // a match below this is not related news
const MAX_WORDS = 30;
const MAX_CHARS = 300;

const SYSTEM = `You assess the market for one of the owner's ventures from recent news, for Indonesia and worldwide.
For the venture and the articles in the data block:
- "articles": for every article, {"id", "relevance": integer 0-100}: how much it matters to this venture's market
- "markets": {"indonesia": {...}, "global": {...}}, each with integer scores 0-100 for "demand", "timing", "competition" (low competition), "capital" (capital efficiency) and "regulatory" (low regulatory risk); higher is always better
- "tailwind" and "headwind": the strongest factor helping and hurting the venture, each {"en", "id", "articleIds"}: one sentence in English and Bahasa Indonesia (at most ${MAX_WORDS} words) and the ids of the relevant articles it rests on (at least 1)
If no article is relevant (all below ${MIN_RELEVANCE}), give only "articles".
Answer with JSON only: {"articles": [...], "markets": {...}, "tailwind": {...}, "headwind": {...}}`;

type Reply = {
  relevance: Map<number, number>;
  /** Null when no article is rated relevant: then nothing is scored. */
  assessment: { markets: Record<"indonesia" | "global", FactorScores>; tailwind: Wind; headwind: Wind } | null;
};
type Wind = { en: string; id: string; articleIds: number[] };

const words = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

/**
 * The checked reply, or throws (the client retries once): ids from the input only,
 * integer scores 0-100, both languages, winds citing articles rated relevant. When
 * no article is rated relevant, markets and winds are not needed (and not used).
 */
export function parseVentureReply(value: unknown, inputIds: ReadonlySet<number>): Reply {
  const v = value as Record<string, unknown> | null;
  if (!v || !Array.isArray(v.articles)) throw new Error("articles must be a list");
  const relevance = new Map<number, number>();
  for (const a of v.articles as { id?: unknown; relevance?: unknown }[]) {
    if (!Number.isInteger(a?.id) || !inputIds.has(a.id as number)) throw new Error(`article ${JSON.stringify(a?.id)} was not in the input`);
    if (relevance.has(a.id as number)) throw new Error(`article ${a.id} is rated twice`);
    if (!Number.isInteger(a.relevance) || (a.relevance as number) < 0 || (a.relevance as number) > 100) throw new Error(`article ${a.id}: relevance must be 0-100`);
    relevance.set(a.id as number, a.relevance as number);
  }
  if (![...relevance.values()].some((r) => r >= MIN_RELEVANCE)) return { relevance, assessment: null };
  const markets = {} as Record<"indonesia" | "global", FactorScores>;
  for (const region of ["indonesia", "global"] as const) {
    const m = (v.markets as Record<string, Record<string, unknown>> | undefined)?.[region];
    if (!m) throw new Error(`markets.${region} is missing`);
    const scores = {} as FactorScores;
    for (const key of FACTOR_KEYS) {
      const s = m[key];
      if (!Number.isInteger(s) || (s as number) < 0 || (s as number) > 100) throw new Error(`markets.${region}.${key} must be an integer 0-100`);
      scores[key] = s as number;
    }
    markets[region] = scores;
  }
  const wind = (name: "tailwind" | "headwind"): Wind => {
    const w = v[name] as Record<string, unknown> | undefined;
    for (const lang of ["en", "id"] as const) {
      const t = w?.[lang];
      if (typeof t !== "string" || !t.trim()) throw new Error(`${name}.${lang} is empty`);
      if (words(t) > MAX_WORDS || Array.from(t).length > MAX_CHARS) throw new Error(`${name}.${lang} is too long`);
    }
    const ids = w?.articleIds;
    if (!Array.isArray(ids) || ids.length === 0) throw new Error(`${name} cites no article`);
    for (const id of ids) {
      if (!inputIds.has(id as number)) throw new Error(`${name}: article ${id} was not in the input`);
      if ((relevance.get(id as number) ?? 0) < MIN_RELEVANCE) throw new Error(`${name}: article ${id} is not rated relevant`);
    }
    return { en: (w!.en as string).trim(), id: (w!.id as string).trim(), articleIds: [...new Set(ids as number[])] };
  };
  return { relevance, assessment: { markets, tailwind: wind("tailwind"), headwind: wind("headwind") } };
}

const NO_NEWS = (candidateIds: number[] = []): VentureMarketInput => ({
  candidateIds,
  articles: [],
  markets: { indonesia: null, global: null },
  relatedArticles: 0,
  winds: { tailwind: null, headwind: null },
});

type Candidate = Awaited<ReturnType<typeof ventureNewsCandidates>>[number];

async function viewOf(venture: Venture, news: Candidate[], transport?: LlmCall<unknown>["fetch"]): Promise<VentureMarketInput> {
  const matches = keywordMatcher(venture.keywords);
  const candidates = news.filter((a) => matches(`${a.headline} ${a.snippet}`)).slice(0, MAX_CANDIDATES);
  if (candidates.length === 0) return NO_NEWS();

  const fence = fenceUntrusted("VENTURE", {
    venture: { name: venture.name, description: venture.descriptionEn, sectors: venture.sectors },
    articles: candidates.map((a) => ({ id: a.id, headline: a.headline, snippet: a.snippet, region: a.region, why: a.why })),
  });
  const inputIds = new Set(candidates.map((a) => a.id));
  const reply = await callLlm({
    job: "ventures",
    role: "report",
    messages: [
      { role: "system", content: `${SYSTEM}\n${fence.rule}` },
      { role: "user", content: `Assess the market for this venture.\n${fence.block}` },
    ],
    parse: (value) => parseVentureReply(value, inputIds),
    maxTokens: 3000,
    fetch: transport,
  });
  const articles = [...reply.relevance].map(([id, relevance]) => ({ id, relevance })).filter((a) => a.relevance >= MIN_RELEVANCE);
  // Matched by keyword, but none rated relevant: no score is invented, and old matches go.
  if (!reply.assessment) return NO_NEWS([...inputIds]);
  const { markets, tailwind, headwind } = reply.assessment;
  const market = (f: FactorScores) => ({
    score: overallScore(Object.fromEntries(FACTOR_KEYS.map((k) => [k, { score: f[k] }])) as Parameters<typeof overallScore>[0]),
    factors: f,
  });
  return {
    candidateIds: [...inputIds],
    articles,
    markets: { indonesia: market(markets.indonesia), global: market(markets.global) },
    relatedArticles: articles.length,
    winds: { tailwind, headwind },
  };
}

export async function assessVentures(options: { transport?: LlmCall<unknown>["fetch"]; now?: () => Date } = {}): Promise<JobOutcome> {
  const now = options.now?.() ?? new Date();
  const day = wibDay(now);
  const news = await ventureNewsCandidates(new Date(now.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000));
  const counts = { ventures: 0, scored: 0, no_news: 0, rejected: 0 };
  const reasons: string[] = [];
  for (const venture of await listVentures()) {
    counts.ventures++;
    let view: VentureMarketInput;
    try {
      view = await viewOf(venture, news, options.transport);
    } catch (error) {
      if (error instanceof BudgetExhaustedError) {
        // Stop, but keep what this run did.
        return { status: "partial", counts, error: `${error.message}; ${counts.scored} ventures assessed before the cap` };
      }
      if (!(error instanceof InvalidOutputError)) throw error; // settings, provider down: stop the run
      counts.rejected++;
      reasons.push(`${venture.slug}: ${error.message}`.slice(0, 200));
      continue; // yesterday's view stays the newest
    }
    await saveVentureView(venture.id, day, view);
    counts[view.markets.indonesia ? "scored" : "no_news"]++;
  }
  return reasons.length ? { status: "partial", counts, error: `${reasons.length} rejected: ${reasons.join("; ")}` } : { status: "ok", counts };
}
