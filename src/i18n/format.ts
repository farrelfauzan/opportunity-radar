import type { Locale } from "./locales";
import { fill, type Messages } from "./t";

const MISSING = "—"; // em dash, shown for null, undefined, NaN or an invalid date
const MINUS = "−"; // U+2212
const NBSP = " ";
const WIB = "Asia/Jakarta";

const tag = (locale: Locale) => (locale === "id" ? "id-ID" : "en-US");

type Num = number | null | undefined;
type When = Date | string | number | null | undefined;

const isMissing = (value: Num): value is null | undefined =>
  value === null || value === undefined || Number.isNaN(value);

function digits(value: number, locale: Locale, fractionDigits: number): string {
  return new Intl.NumberFormat(tag(locale), {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

/** Whole rupiah, rounded half-up on the amount: "Rp 1.935.000" (id), "Rp 1,935,000" (en). */
export function formatRupiah(value: Num, locale: Locale): string {
  if (isMissing(value)) return MISSING;
  const amount = Math.round(Math.abs(value));
  const sign = value < 0 && amount > 0 ? MINUS : "";
  return `${sign}Rp${NBSP}${digits(amount, locale, 0)}`;
}

/** From this amount (Rp 1,000 trillion) upwards the calculators show "more than Rp 1,000 trillion". */
export const BEYOND_RUPIAH = 1e15;

/**
 * Short form for large amounts: "Rp 425.7 million", "Rp 1.20 billion" (en);
 * "Rp 425,7 juta", "Rp 1,20 miliar" (id). Below a million it is the whole amount.
 * From Rp 1,000 trillion upwards it is `beyond` (calc.result.beyond), with a minus
 * sign for a loss: never a 40-digit amount and never exponent notation.
 */
export function formatRupiahCompact(
  value: Num,
  locale: Locale,
  units: Messages["calc"]["unit"],
  beyond: string,
): string {
  if (isMissing(value)) return MISSING;
  const amount = Math.abs(value);
  if (amount >= BEYOND_RUPIAH) return `${value < 0 ? MINUS : ""}${beyond}`;
  if (amount < 1e6) return formatRupiah(value, locale);
  const [divisor, fractionDigits, unit] =
    amount >= 1e12
      ? [1e12, 2, units.trillion]
      : amount >= 1e9
        ? [1e9, 2, units.billion]
        : [1e6, 1, units.million];
  return `${value < 0 ? MINUS : ""}Rp${NBSP}${digits(amount / divisor, locale, fractionDigits)} ${unit}`;
}

/** "$1,234.50" (en), "US$1.234,50" (id). */
export function formatUsd(value: Num, locale: Locale): string {
  if (isMissing(value)) return MISSING;
  const text = digits(Math.abs(value), locale, 2);
  const sign = value < 0 && Number(Math.abs(value).toFixed(2)) > 0 ? MINUS : "";
  return `${sign}${locale === "id" ? "US$" : "$"}${text}`;
}

/** A ratio as a signed percent with one decimal: 0.024 → "+2.4%"; zero → "0%". */
export function formatPercent(ratio: Num, locale: Locale): string {
  if (isMissing(ratio)) return MISSING;
  const percent = Math.abs(ratio) * 100;
  if (Number(percent.toFixed(1)) === 0) return "0%";
  return `${ratio < 0 ? MINUS : "+"}${digits(percent, locale, 1)}%`;
}

function toDate(value: When): Date | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function wibParts(date: Date, locale: Locale) {
  const parts = new Intl.DateTimeFormat(tag(locale), {
    timeZone: WIB,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return { day: part("day"), month: part("month"), year: part("year"), hour: part("hour"), minute: part("minute") };
}

/** Always in WIB: "4 Oct 2026, 00:30 WIB" (en), "4 Okt 2026, 00.30 WIB" (id). */
export function formatDateTimeWib(value: When, locale: Locale): string {
  const date = toDate(value);
  if (!date) return MISSING;
  const p = wibParts(date, locale);
  return `${p.day} ${p.month} ${p.year}, ${p.hour}${locale === "id" ? "." : ":"}${p.minute} WIB`;
}

/** The WIB clock time: "09:30" (en), "09.30" (id). */
export function formatTimeWib(value: When, locale: Locale): string {
  const date = toDate(value);
  if (!date) return MISSING;
  const p = wibParts(date, locale);
  return `${p.hour}${locale === "id" ? "." : ":"}${p.minute}`;
}

/** The WIB date without the year: "3 Oct" (en), "3 Okt" (id). */
export function formatDateShortWib(value: When, locale: Locale): string {
  const date = toDate(value);
  if (!date) return MISSING;
  const p = wibParts(date, locale);
  return `${p.day} ${p.month}`;
}

/**
 * "just now", "59m ago", "23h ago", "6d ago", then the WIB date ("26 Sep", with
 * the year when it is not the current year). A future time reads "just now".
 */
export function formatRelativeTime(
  value: When,
  now: Date,
  locale: Locale,
  strings: Messages["time"],
): string {
  const date = toDate(value);
  if (!date) return MISSING;

  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (seconds < 60) return strings.justNow;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return fill(strings.minutesAgo, { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return fill(strings.hoursAgo, { n: hours });
  const days = Math.floor(hours / 24);
  if (days < 7) return fill(strings.daysAgo, { n: days });

  const then = wibParts(date, locale);
  const sameYear = then.year === wibParts(now, locale).year;
  return sameYear ? `${then.day} ${then.month}` : `${then.day} ${then.month} ${then.year}`;
}
