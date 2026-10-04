import type { Locale } from "@/i18n/locales";
import { CAPITAL_LEVELS, HORIZONS, REGIONS, SECTORS, type OpportunityFilter } from "@/server/data";

/** The filters of the Opportunities screen: ?region=, ?sector=, ?horizon= and ?capital=. */
export type OpportunityQuery = OpportunityFilter;

type Params = Record<string, string | string[] | undefined>;

function pick<T extends string>(allowed: readonly T[], value: string | string[] | undefined): T | undefined {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}

/**
 * Reads the four filters. Anything that is not a known value (a wrong case, an
 * unknown id, a repeated parameter) falls back to "all" without an error.
 */
export function parseOpportunityQuery(params: Params): OpportunityQuery {
  return {
    region: pick(REGIONS, params.region),
    sector: pick(SECTORS, params.sector),
    horizon: pick(HORIZONS, params.horizon),
    capital: pick(CAPITAL_LEVELS, params.capital),
  };
}

export const isFiltered = (query: OpportunityQuery) =>
  query.region !== undefined || query.sector !== undefined || query.horizon !== undefined || query.capital !== undefined;

/** The list URL, or the detail URL when `id` is given; the filters are kept, the defaults left out. */
export function opportunitiesHref(locale: Locale, query: OpportunityQuery, id?: number): string {
  const search = new URLSearchParams();
  for (const name of ["region", "sector", "horizon", "capital"] as const) {
    const value = query[name];
    if (value) search.set(name, value);
  }
  const text = search.toString();
  return `/${locale}/opportunities${id === undefined ? "" : `/${id}`}${text ? `?${text}` : ""}`;
}

/** The id of the detail route, or null when it cannot be an id (then the route is a 404). */
export function parseOpportunityId(value: string): number | null {
  return /^[1-9]\d{0,8}$/.test(value) ? Number(value) : null;
}
