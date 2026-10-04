// The daily brief (OR-22), the last morning step: what changed today for
// business opportunities, in 3-5 lines by category, in EN and ID, each citing
// the articles it rests on and naming the affected opportunities.
import { briefArticles, CATEGORIES, opportunityChanges, saveBrief, wibDay, type BriefLine, type Category } from "@/server/data";
import type { JobOutcome } from "@/server/jobs/runner";
import { callLlm, type LlmCall } from "@/server/llm/client";
import { fenceUntrusted } from "@/server/llm/fence";

const MIN_ARTICLES = 10;
const MAX_INPUT_ARTICLES = 200;
const MAX_WORDS = 35;
const MAX_CHARS = 300;

const SYSTEM = `You write the morning brief of a business-opportunity radar for Indonesia and the world: what changed today.
From the articles and the day's opportunity changes in the data block, write 3 to 5 lines. Each line:
- "label": the news category it is about, one of ${CATEGORIES.map((c) => `"${c}"`).join(", ")}
- "en" and "id": one sentence each (English and Bahasa Indonesia), at most ${MAX_WORDS} words
- "opportunityIds": the ids of the opportunities this line affects (from "opportunities" in the data; may be empty)
- "articleIds": the ids of the articles it rests on (at least 1)
Answer with JSON only: {"lines": [ ... ]}`;

const words = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

/** A checked brief; throws (so the client retries once) when the reply breaks a rule. */
export function parseBrief(value: unknown, articleIds: ReadonlySet<number>, opportunityIds: ReadonlySet<number>): BriefLine[] {
  const lines = (value as { lines?: unknown } | null)?.lines;
  if (!Array.isArray(lines) || lines.length < 3 || lines.length > 5) throw new Error("lines must be a list of 3 to 5");
  return lines.map((raw, i) => {
    const line = raw as Record<string, unknown>;
    const at = `line ${i + 1}`;
    if (!CATEGORIES.includes(line?.label as Category)) throw new Error(`${at}: unknown label ${JSON.stringify(line?.label)}`);
    for (const lang of ["en", "id"] as const) {
      const text = line[lang];
      if (typeof text !== "string" || !text.trim()) throw new Error(`${at}: ${lang} is empty`);
      if (words(text) > MAX_WORDS || Array.from(text).length > MAX_CHARS) throw new Error(`${at}: ${lang} is longer than ${MAX_WORDS} words`);
    }
    const ids = (value: unknown, name: string) => {
      if (!Array.isArray(value) || !value.every((v) => Number.isInteger(v))) throw new Error(`${at}: ${name} must be a list of ids`);
      return [...new Set(value as number[])];
    };
    const opps = ids(line.opportunityIds, "opportunityIds");
    for (const id of opps) if (!opportunityIds.has(id)) throw new Error(`${at}: opportunity ${id} is not one of today's changes`);
    const cited = ids(line.articleIds, "articleIds");
    if (cited.length === 0) throw new Error(`${at}: cites no article`);
    for (const id of cited) if (!articleIds.has(id)) throw new Error(`${at}: article ${id} was not in the input`);
    return { label: line.label as Category, en: (line.en as string).trim(), id: (line.id as string).trim(), opportunityIds: opps, articleIds: cited };
  });
}

export async function writeBrief(options: { transport?: LlmCall<unknown>["fetch"]; now?: () => Date } = {}): Promise<JobOutcome> {
  const now = options.now?.() ?? new Date();
  const day = wibDay(now);
  const relevant = await briefArticles(new Date(now.getTime() - 24 * 60 * 60 * 1000));
  const counts = { articles: relevant.length, sources: new Set(relevant.map((a) => a.sourceId)).size, lines: 0 };
  if (relevant.length < MIN_ARTICLES) {
    console.info(`brief: ${relevant.length} relevant articles in 24 h (fewer than ${MIN_ARTICLES}): no brief today`);
    return { status: "ok", counts };
  }
  const input = relevant.slice(0, MAX_INPUT_ARTICLES);
  const changes = await opportunityChanges(day);
  const fence = fenceUntrusted("BRIEF", {
    articles: input.map((a) => ({ id: a.id, category: a.category, headline: a.headline, why: a.why })),
    opportunities: changes,
  });
  const articleIds = new Set(input.map((a) => a.id));
  const opportunityIds = new Set(changes.map((o) => o.id));
  // Invalid output twice throws: the job fails visibly and the day has no brief.
  const lines = await callLlm({
    job: "brief",
    role: "report",
    messages: [
      { role: "system", content: `${SYSTEM}\n${fence.rule}` },
      { role: "user", content: `Write today's brief.\n${fence.block}` },
    ],
    parse: (value) => parseBrief(value, articleIds, opportunityIds),
    maxTokens: 2000,
    fetch: options.transport,
  });
  await saveBrief({ day, lines, articleCount: counts.articles, sourceCount: counts.sources });
  counts.lines = lines.length;
  return { status: "ok", counts };
}
