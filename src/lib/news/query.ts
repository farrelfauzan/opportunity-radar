import { CATEGORIES, REGIONS, type Category, type Region } from "@/server/data";
import type { Locale } from "@/i18n/locales";

/** Items shown at first, and added by each "Load more". */
export const PAGE_SIZE = 30;
const MAX_SHOWN = 3000;

export type NewsQuery = { category?: Category; region?: Region; shown: number };

type Params = Record<string, string | string[] | undefined>;

function pick<T extends string>(allowed: readonly T[], value: string | string[] | undefined): T | undefined {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}

/**
 * Reads ?category=, ?region= and ?shown=. Anything that is not a known value
 * (including a repeated parameter) falls back to "all" / the first page.
 */
export function parseNewsQuery(params: Params): NewsQuery {
  const shown = typeof params.shown === "string" && /^\d{1,4}$/.test(params.shown) ? Number(params.shown) : 0;
  return {
    category: pick(CATEGORIES, params.category),
    region: pick(REGIONS, params.region),
    shown: Math.min(Math.max(shown, PAGE_SIZE), MAX_SHOWN),
  };
}

/** The News URL for a query; the default values are left out. */
export function newsHref(locale: Locale, query: Partial<NewsQuery>): string {
  const search = new URLSearchParams();
  if (query.category) search.set("category", query.category);
  if (query.region) search.set("region", query.region);
  if (query.shown && query.shown > PAGE_SIZE) search.set("shown", String(query.shown));
  const text = search.toString();
  return `/${locale}/news${text ? `?${text}` : ""}`;
}
