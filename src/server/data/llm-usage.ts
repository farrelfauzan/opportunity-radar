import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "./client.ts";
import { llmUsage } from "./schema.ts";

export type LlmUsage = typeof llmUsage.$inferSelect;
export type NewLlmUsage = Omit<typeof llmUsage.$inferInsert, "id" | "createdAt">;

export async function recordLlmUsage(row: NewLlmUsage): Promise<LlmUsage> {
  const [stored] = await db().insert(llmUsage).values(row).returning();
  return stored;
}

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

/** The start of the calendar month in WIB that contains `at`, as a UTC instant. */
export function wibMonthStart(at: Date = new Date()): Date {
  const wib = new Date(at.getTime() + WIB_OFFSET_MS);
  return new Date(Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), 1) - WIB_OFFSET_MS);
}

/**
 * Live usage this WIB month: total cost of the calls whose cost is known, and
 * total tokens of all calls. Mock calls cost nothing and are not counted.
 */
export async function liveUsageThisMonth(at: Date = new Date()): Promise<{ costUsd: number; tokens: number }> {
  const [row] = await db()
    .select({
      costUsd: sql<number>`coalesce(sum(${llmUsage.costUsd}), 0)::float8`,
      tokens: sql<number>`coalesce(sum(coalesce(${llmUsage.inputTokens}, 0) + coalesce(${llmUsage.outputTokens}, 0)), 0)::int8`,
    })
    .from(llmUsage)
    .where(and(eq(llmUsage.provider, "live"), gte(llmUsage.createdAt, wibMonthStart(at))));
  return { costUsd: Number(row.costUsd), tokens: Number(row.tokens) };
}
