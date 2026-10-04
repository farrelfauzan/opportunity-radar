// Headline triage (OR-14): for each new article, the AI gives a category,
// region, relevance, impact, a one-sentence "why it matters" in EN and ID and
// up to 3 themes. Input is the headline, snippet, source and region only.
import {
  CATEGORIES,
  IMPACTS,
  REGIONS,
  saveTriage,
  THEMES,
  untriagedArticles,
  type Category,
  type Impact,
  type Region,
  type Theme,
  type TriageInput,
  type TriageResult,
} from "@/server/data";
import type { JobOutcome } from "@/server/jobs/runner";
import { callLlm, InvalidOutputError, type LlmCall } from "@/server/llm/client";
import { fenceUntrusted } from "@/server/llm/fence";

export const BATCH_SIZE = 10;
const MAX_WHY_WORDS = 30;
const MAX_THEMES = 3;
// Output tokens reserved per batch against the monthly cap (about 120 per article).
const MAX_TOKENS = 1500;

const SYSTEM = `You triage news headlines for a business-opportunity radar covering Indonesia and the world.
For every article in the data block, return one item:
- "id": the article's id, unchanged
- "category": one of ${CATEGORIES.map((c) => `"${c}"`).join(", ")} (politics means politics & policy)
- "region": "indonesia" if the news is about Indonesia, otherwise "global"
- "relevance": integer 0-100, how useful the news is for spotting business opportunities
- "impact": "opportunity", "risk" or "context" for businesses
- "why": {"en": "...", "id": "..."}: one sentence each, at most ${MAX_WHY_WORDS} words, on why it matters for business; "id" in Bahasa Indonesia
- "themes": 1 to ${MAX_THEMES} ids from this list: ${THEMES.join(", ")}
Answer with JSON only, exactly {"items": [ ... ]}, with no other text.`;

const words = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

/** One item of the reply checked against the contract, or the reason it was rejected. */
export function checkItem(raw: unknown): { id: number; result: Omit<Extract<TriageResult, { status: "ok" }>, "articleId"> } | string {
  const item = raw as Record<string, unknown> | null;
  if (!item || typeof item !== "object") return "item is not an object";
  const id = item.id;
  if (typeof id !== "number" || !Number.isInteger(id)) return "id is missing";
  const { category, region, relevance, impact } = item;
  const why = item.why as { en?: unknown; id?: unknown } | undefined;
  if (!CATEGORIES.includes(category as Category)) return `unknown category ${JSON.stringify(category)}`;
  if (!REGIONS.includes(region as Region)) return `unknown region ${JSON.stringify(region)}`;
  if (typeof relevance !== "number" || !Number.isInteger(relevance) || relevance < 0 || relevance > 100) {
    return "relevance must be an integer 0-100";
  }
  if (!IMPACTS.includes(impact as Impact)) return `unknown impact ${JSON.stringify(impact)}`;
  const whyEn = typeof why?.en === "string" ? why.en.trim() : "";
  const whyId = typeof why?.id === "string" ? why.id.trim() : "";
  if (!whyEn || !whyId) return "why must be given in EN and ID";
  if (words(whyEn) > MAX_WHY_WORDS || words(whyId) > MAX_WHY_WORDS) return `why is longer than ${MAX_WHY_WORDS} words`;
  // scoring-v1 §8: an unknown theme becomes "other"; at most 3, no repeats.
  const listed = Array.isArray(item.themes) ? item.themes : [];
  const themes = [...new Set(listed.map((t) => (THEMES.includes(t as Theme) ? (t as Theme) : "other")))].slice(0, MAX_THEMES);
  if (themes.length === 0) return "themes are missing";
  return {
    id,
    result: { status: "ok", category: category as Category, region: region as Region, relevance, impact: impact as Impact, whyEn, whyId, themes },
  };
}

/** The reply's shape: {"items": [...]}. Anything else is invalid output (retried once). */
function parseEnvelope(value: unknown): unknown[] {
  const items = (value as { items?: unknown } | null)?.items;
  if (!Array.isArray(items)) throw new Error('expected {"items": [...]}');
  return items;
}

/** Triage of one batch. Never throws for bad output: those articles are returned as failed. */
export async function triageBatch(batch: TriageInput[], transport?: LlmCall<unknown>["fetch"]): Promise<TriageResult[]> {
  const fence = fenceUntrusted(
    "ARTICLES",
    batch.map(({ id, headline, snippet, source, region, feedCategory }) => ({ id, headline, snippet, source, region, feedCategory })),
  );
  let items: unknown[];
  try {
    items = await callLlm({
      job: "triage",
      role: "triage",
      messages: [
        { role: "system", content: `${SYSTEM}\n${fence.rule}` },
        { role: "user", content: `Triage these ${batch.length} articles.\n${fence.block}` },
      ],
      parse: parseEnvelope,
      maxTokens: MAX_TOKENS,
      fetch: transport,
    });
  } catch (error) {
    if (!(error instanceof InvalidOutputError)) throw error; // budget, settings, provider down: stop the run
    return batch.map((a) => ({ articleId: a.id, status: "failed", error: error.message.slice(0, 300) }));
  }

  const checked = new Map<number, ReturnType<typeof checkItem>>();
  for (const raw of items) {
    const outcome = checkItem(raw);
    const id = typeof outcome === "string" ? (raw as { id?: unknown } | null)?.id : outcome.id;
    if (typeof id === "number" && !checked.has(id)) checked.set(id, outcome);
  }
  return batch.map((article): TriageResult => {
    const outcome = checked.get(article.id);
    if (outcome === undefined) return { articleId: article.id, status: "failed", error: "missing from the reply" };
    if (typeof outcome === "string") return { articleId: article.id, status: "failed", error: outcome };
    return { articleId: article.id, ...outcome.result };
  });
}

/**
 * The triage job: every visible, untriaged article, in batches of 10, until
 * none is left. Settled batches are stored as they finish, so a run that stops
 * (cap reached, provider down) keeps its work; the rest waits for the next run.
 */
export async function triageNews(options: { transport?: LlmCall<unknown>["fetch"]; maxArticles?: number } = {}): Promise<JobOutcome> {
  const counts = { ok: 0, failed: 0, batches: 0 };
  const limit = options.maxArticles ?? Number.POSITIVE_INFINITY;
  const done = new Set<number>();
  while (counts.ok + counts.failed < limit) {
    const batch = await untriagedArticles(Math.min(BATCH_SIZE, limit - counts.ok - counts.failed));
    if (batch.length === 0) break;
    // Every stored result leaves the queue; an article coming back means storing failed.
    if (batch.some((a) => done.has(a.id))) throw new Error("triage made no progress: results were not stored");
    for (const a of batch) done.add(a.id);
    const results = await triageBatch(batch, options.transport);
    await saveTriage(results);
    counts.batches++;
    for (const r of results) counts[r.status]++;
  }
  return counts.failed > 0 ? { status: "partial", counts, error: `${counts.failed} articles could not be triaged` } : { status: "ok", counts };
}
