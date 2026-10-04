import "server-only";

import en from "./dictionaries/en.json";
import id from "./dictionaries/id.json";
import type { Locale } from "./locales";
import { createT, type Messages } from "./t";

// Server-only: client components receive the strings they need as props.
const dictionaries: Record<Locale, Messages> = { en, id };

export function getMessages(locale: Locale): Messages {
  return dictionaries[locale];
}

export function getT(locale: Locale) {
  return createT(dictionaries[locale]);
}
