import { asc } from "drizzle-orm";
import { db } from "./client.ts";
import { sources } from "./schema.ts";

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
