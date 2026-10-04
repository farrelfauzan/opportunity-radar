import { asc, eq } from "drizzle-orm";
import { db } from "./client.ts";
import { ventures } from "./schema.ts";

export type Venture = typeof ventures.$inferSelect;
export type NewVenture = Omit<typeof ventures.$inferInsert, "id" | "createdAt">;

/** Creates the venture, or updates it when the slug already exists. */
export async function upsertVenture(input: NewVenture): Promise<Venture> {
  const [row] = await db()
    .insert(ventures)
    .values(input)
    .onConflictDoUpdate({ target: ventures.slug, set: input })
    .returning();
  return row;
}

export async function listVentures(): Promise<Venture[]> {
  return db().select().from(ventures).orderBy(asc(ventures.id));
}

/** The venture with this slug, or null (the venture view answers 404). */
export async function getVenture(slug: string): Promise<Venture | null> {
  const [row] = await db().select().from(ventures).where(eq(ventures.slug, slug));
  return row ?? null;
}
