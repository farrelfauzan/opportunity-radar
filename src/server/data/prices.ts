import { and, asc, desc, eq, gte, lte, ne, sql } from "drizzle-orm";
import { db } from "./client.ts";
import { assets, candles, quotes } from "./schema.ts";

export type Asset = typeof assets.$inferSelect;
export type NewAsset = Omit<typeof assets.$inferInsert, "id" | "createdAt">;
export type Candle = { day: string; open: number; high: number; low: number; close: number; volume: number | null };
export type Quote = typeof quotes.$inferSelect;

/** Creates the asset, or updates it when the slug already exists. */
export async function upsertAsset(input: NewAsset): Promise<Asset> {
  const [row] = await db().insert(assets).values(input).onConflictDoUpdate({ target: assets.slug, set: input }).returning();
  return row;
}

export async function listAssets(): Promise<Asset[]> {
  return db().select().from(assets).orderBy(asc(assets.id));
}

export async function getAssetBySlug(slug: string): Promise<Asset | null> {
  const [row] = await db().select().from(assets).where(eq(assets.slug, slug));
  return row ?? null;
}

type Executor = Pick<ReturnType<typeof db>, "insert" | "delete">;

// A synthetic (made-up) value never replaces a real one, e.g. when a live switch is lost.
const notSyntheticOverReal = (table: typeof candles | typeof quotes) => sql`excluded.source <> 'synthetic' or ${table.source} = 'synthetic'`;

/**
 * Stores daily candles; a day that is already stored is replaced (late corrections),
 * except that a synthetic row never replaces a real one.
 */
export async function upsertCandles(assetId: number, source: string, rows: Candle[], executor: Executor = db()): Promise<number> {
  if (rows.length === 0) return 0;
  const CHUNK = 1000; // stays under Postgres' bind-parameter limit
  for (let i = 0; i < rows.length; i += CHUNK) {
    await executor
      .insert(candles)
      .values(rows.slice(i, i + CHUNK).map((c) => ({ ...c, assetId, source })))
      .onConflictDoUpdate({
        target: [candles.assetId, candles.day],
        set: {
          open: sql`excluded.open`,
          high: sql`excluded.high`,
          low: sql`excluded.low`,
          close: sql`excluded.close`,
          volume: sql`excluded.volume`,
          source: sql`excluded.source`,
          fetchedAt: sql`now()`,
        },
        setWhere: notSyntheticOverReal(candles),
      });
  }
  return rows.length;
}

/** The newest stored candle day of an asset (from one source, if given), or null. */
export async function lastCandleDay(assetId: number, source?: string): Promise<string | null> {
  const [row] = await db()
    .select({ day: candles.day })
    .from(candles)
    .where(and(eq(candles.assetId, assetId), source ? eq(candles.source, source) : undefined))
    .orderBy(desc(candles.day))
    .limit(1);
  return row?.day ?? null;
}

/** Whether an asset has any real (not synthetic) candle. */
export async function hasRealCandles(assetId: number): Promise<boolean> {
  const [row] = await db()
    .select({ day: candles.day })
    .from(candles)
    .where(and(eq(candles.assetId, assetId), ne(candles.source, "synthetic")))
    .limit(1);
  return Boolean(row);
}

/**
 * The first live backfill of an asset: stores the real candles and removes the
 * asset's synthetic ones (made-up fixtures data) in one transaction, so a series
 * is never mixed and never left half-replaced. Only rows with source "synthetic"
 * are removed.
 */
export async function replaceWithLiveBackfill(assetId: number, rows: Candle[], source = "yahoo"): Promise<{ stored: number; removed: number }> {
  return db().transaction(async (tx) => {
    const stored = await upsertCandles(assetId, source, rows, tx);
    const removed = await tx
      .delete(candles)
      .where(and(eq(candles.assetId, assetId), eq(candles.source, "synthetic")))
      .returning({ day: candles.day });
    return { stored, removed: removed.length };
  });
}

/** Daily candles of an asset between two days (inclusive), oldest first. */
export async function listCandles(assetId: number, from: string, to: string): Promise<Candle[]> {
  return db()
    .select({ day: candles.day, open: candles.open, high: candles.high, low: candles.low, close: candles.close, volume: candles.volume })
    .from(candles)
    .where(and(eq(candles.assetId, assetId), gte(candles.day, from), lte(candles.day, to)))
    .orderBy(asc(candles.day));
}

/** Sets the latest price of an asset, with its source and as-of time. A synthetic price never replaces a real one. */
export async function setQuote(assetId: number, quote: { price: number; asOf: Date; source: string }): Promise<void> {
  await db()
    .insert(quotes)
    .values({ assetId, ...quote })
    .onConflictDoUpdate({ target: quotes.assetId, set: { ...quote, fetchedAt: sql`now()` }, setWhere: notSyntheticOverReal(quotes) });
}

export async function getQuote(assetId: number): Promise<Quote | null> {
  const [row] = await db().select().from(quotes).where(eq(quotes.assetId, assetId));
  return row ?? null;
}
