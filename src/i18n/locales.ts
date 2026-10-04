export const locales = ["en", "id"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";

/** Cookie holding the language the user last picked. Set by the language switch. */
export const localeCookie = "locale";

export function hasLocale(value: string | undefined): value is Locale {
  return locales.includes(value as Locale);
}
