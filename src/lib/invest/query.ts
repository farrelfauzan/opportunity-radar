import type { Locale } from "@/i18n/locales";
import type { SignalTerm } from "@/server/data";

type Params = Record<string, string | string[] | undefined>;

/** The term the screen opens on. */
export const DEFAULT_TERM: SignalTerm = "long";

/** Reads ?term=: "short" is short term; anything else (missing, unknown, a wrong case, a repeated parameter) is long term. */
export function parseTerm(params: Params): SignalTerm {
  return params.term === "short" ? "short" : DEFAULT_TERM;
}

/**
 * The Investments URL for a term. Every other query value is kept as it was; the term is left out for the
 * default (long term), so `?term=short` is the only spelling of the other one.
 */
export function investHref(locale: Locale, params: Params, term: SignalTerm): string {
  const search = new URLSearchParams();
  for (const [name, value] of Object.entries(params)) {
    if (name === "term" || value === undefined) continue;
    for (const one of Array.isArray(value) ? value : [value]) search.append(name, one);
  }
  if (term !== DEFAULT_TERM) search.set("term", term);
  const text = search.toString();
  return `/${locale}/invest${text ? `?${text}` : ""}`;
}
