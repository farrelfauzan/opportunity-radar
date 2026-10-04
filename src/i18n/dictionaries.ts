import "server-only";

import { notFound } from "next/navigation";
import { locale as rootLocale } from "next/root-params";
import en from "./dictionaries/en.json";
import id from "./dictionaries/id.json";
import { hasLocale, type Locale } from "./locales";
import { createT, type Messages } from "./t";

// Server-only: client components receive the strings they need as props.
const dictionaries: Record<Locale, Messages> = { en, id };

export function getT(locale: Locale) {
  return createT(dictionaries[locale]);
}

/** The locale of the current request, from the /[locale] segment. Anything else is a 404. */
export async function currentLocale(): Promise<Locale> {
  const locale = await rootLocale();
  if (!hasLocale(locale)) notFound();
  return locale;
}
