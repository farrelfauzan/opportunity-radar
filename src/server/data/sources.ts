import { and, asc, count, eq, gte } from "drizzle-orm";
import { db } from "./client.ts";
import { articles, sources } from "./schema.ts";

export type Source = typeof sources.$inferSelect;
export type NewSource = Pick<Source, "slug" | "name" | "feedUrl" | "region" | "category">;

/** Creates the source, or updates it when the slug already exists. */
export async function upsertSource(input: NewSource): Promise<Source> {
  const [row] = await db()
    .insert(sources)
    .values(input)
    .onConflictDoUpdate({ target: sources.slug, set: input })
    .returning();
  return row;
}

export async function listSources(): Promise<Source[]> {
  return db().select().from(sources).orderBy(asc(sources.region), asc(sources.name));
}

/** Records the outcome of one feed check. A 304 is a successful check and keeps the stored validators. */
export async function recordSourceCheck(
  id: number,
  check: { status: string; ok: boolean; at: Date; etag?: string | null; lastModified?: string | null },
): Promise<void> {
  await db()
    .update(sources)
    .set({
      lastStatus: check.status,
      lastCheckedAt: check.at,
      ...(check.ok ? { lastSuccessAt: check.at } : {}),
      ...(check.status === "200" ? { etag: check.etag ?? null, lastModified: check.lastModified ?? null } : {}),
    })
    .where(eq(sources.id, id));
}

export type SourceHealth = {
  slug: string;
  name: string;
  lastSuccessAt: Date | null;
  lastStatus: string | null;
  articles24h: number;
};

/** Per active source: last successful check, last status, and articles stored in the last 24 hours. */
export async function sourceHealth(now: Date = new Date()): Promise<SourceHealth[]> {
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  return db()
    .select({
      slug: sources.slug,
      name: sources.name,
      lastSuccessAt: sources.lastSuccessAt,
      lastStatus: sources.lastStatus,
      articles24h: count(articles.id),
    })
    .from(sources)
    .leftJoin(articles, and(eq(articles.sourceId, sources.id), gte(articles.fetchedAt, since)))
    .where(eq(sources.active, true))
    .groupBy(sources.id)
    .orderBy(asc(sources.region), asc(sources.name));
}
