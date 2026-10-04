export const locales = ["en", "id"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";

/** Cookie holding the language the user last picked. Set by the language switch. */
export const localeCookie = "locale";

/**
 * The lowercase spelling of a path whose first segment is a supported locale
 * written in other letter case ("/EN/news" → "/en/news"), or null when the path
 * needs no change. Used by the proxy: on a case-insensitive file system (macOS)
 * the page cache entry for "/EN" is the same file as the one for "/en", so
 * rendering "/EN" would overwrite the prerendered "/en" page (OR-55).
 */
export function canonicalLocalePath(pathname: string): string | null {
  const [, first = ""] = pathname.split("/");
  const lower = first.toLowerCase();
  if (first === lower || !hasLocale(lower)) return null;
  return `/${lower}${pathname.slice(first.length + 1)}`;
}

export function hasLocale(value: string | undefined): value is Locale {
  return locales.includes(value as Locale);
}
