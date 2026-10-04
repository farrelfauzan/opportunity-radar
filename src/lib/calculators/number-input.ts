import type { Locale } from "@/i18n/locales";

const tag = (locale: Locale) => (locale === "id" ? "id-ID" : "en-US");

/** A number as it is typed in the locale: "10.000.000" and "3,5" (id), "10,000,000" and "3.5" (en). */
export function formatNumberInput(value: number, locale: Locale): string {
  return new Intl.NumberFormat(tag(locale), { maximumFractionDigits: 2 }).format(value);
}

/**
 * Reads a typed number in the locale's notation: /id takes "10.000.000" and
 * "8,5", /en takes "10,000,000" and "8.5". Thousands separators are optional
 * but must sit every three digits and cannot start with 0, so "8.5" on /id is
 * not read as 85 and "0.001" is not read as 1.
 * Returns null when the text is not a number.
 */
export function parseNumberInput(text: string, locale: Locale): number | null {
  const [group, decimal] = locale === "id" ? ["\\.", ","] : [",", "\\."];
  const pattern = new RegExp(`^[-−]?([1-9]\\d{0,2}(${group}\\d{3})+|\\d+)(${decimal}\\d+)?$`);
  const trimmed = text.trim();
  if (!pattern.test(trimmed)) return null;
  const plain = trimmed
    .replace("−", "-")
    .replace(new RegExp(group, "g"), "")
    .replace(",", ".");
  return Number(plain);
}

export type NumberRange = { min: number; max: number; integer?: boolean };
export type NumberInputResult = { value: number } | { error: "required" | "range" };

/** "required" when the text is empty or not a number, "range" when it is outside the range. */
export function validateNumberInput(text: string, locale: Locale, range: NumberRange): NumberInputResult {
  const value = parseNumberInput(text, locale);
  if (value === null) return { error: "required" };
  if (value < range.min || value > range.max || (range.integer && !Number.isInteger(value))) {
    return { error: "range" };
  }
  return { value };
}
