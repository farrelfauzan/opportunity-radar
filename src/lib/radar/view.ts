import { fill, type Messages } from "@/i18n/t";

/** The singular or plural form of a counted phrase ("{n} article" / "{n} articles"). */
export const plural = (count: number, forms: { one: string; other: string }) =>
  fill(count === 1 ? forms.one : forms.other, { n: count });

/** "2 opportunities affected" for a brief line; null when the line affects none (then nothing is shown). */
export function affectedText(count: number, strings: Messages["radar"]["brief"]["affected"]): string | null {
  return count > 0 ? plural(count, strings) : null;
}

/** The brief's footer: "AI summary of 112 articles from 14 sources". */
export function briefSourceText(articleCount: number, sourceCount: number, strings: Messages["radar"]["brief"]): string {
  return fill(strings.source, {
    articles: plural(articleCount, strings.articles),
    sources: plural(sourceCount, strings.sources),
  });
}

/** "Saturday, 3 October 2026 · updated 07:00 WIB"; just the date when no morning run is on record. */
export function updatedText(date: string, time: string | null, template: string): string {
  return time === null ? date : fill(template, { date, time });
}
