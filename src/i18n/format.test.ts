import { describe, expect, test } from "vitest";
import en from "./dictionaries/en.json";
import id from "./dictionaries/id.json";
import {
  formatDateLongWib,
  formatDateShortWib,
  formatDateTimeWib,
  formatChange,
  formatNumber,
  formatPercent,
  formatRelativeTime,
  formatRupiah,
  formatRupiahCompact,
  formatTimeWib,
  formatUsd,
  formatUsdPrice,
} from "./format";

// Exact characters: NBSP (U+00A0) after "Rp", minus U+2212, em dash U+2014.
const NBSP = " ";
const MINUS = "−";
const DASH = "—";

describe("formatRupiah", () => {
  test.each([
    [1935000, `Rp${NBSP}1.935.000`, `Rp${NBSP}1,935,000`],
    [-1935000, `${MINUS}Rp${NBSP}1.935.000`, `${MINUS}Rp${NBSP}1,935,000`],
    [0, `Rp${NBSP}0`, `Rp${NBSP}0`],
    [1935000.5, `Rp${NBSP}1.935.001`, `Rp${NBSP}1,935,001`],
    [2e12, `Rp${NBSP}2.000.000.000.000`, `Rp${NBSP}2,000,000,000,000`],
    [-0.4, `Rp${NBSP}0`, `Rp${NBSP}0`],
  ])("%d", (value, inId, inEn) => {
    expect(formatRupiah(value, "id")).toBe(inId);
    expect(formatRupiah(value, "en")).toBe(inEn);
  });
});

test("formatRupiahCompact", () => {
  expect(formatRupiahCompact(425_665_138, "en", en.calc.unit, en.calc.result.beyond)).toBe(`Rp${NBSP}425.7 million`);
  expect(formatRupiahCompact(425_665_138, "id", id.calc.unit, id.calc.result.beyond)).toBe(`Rp${NBSP}425,7 juta`);
  expect(formatRupiahCompact(1_204_000_000, "en", en.calc.unit, en.calc.result.beyond)).toBe(`Rp${NBSP}1.20 billion`);
  expect(formatRupiahCompact(1_204_000_000, "id", id.calc.unit, id.calc.result.beyond)).toBe(`Rp${NBSP}1,20 miliar`);
  expect(formatRupiahCompact(2e12, "en", en.calc.unit, en.calc.result.beyond)).toBe(`Rp${NBSP}2.00 trillion`);
  expect(formatRupiahCompact(2e12, "id", id.calc.unit, id.calc.result.beyond)).toBe(`Rp${NBSP}2,00 triliun`);
  expect(formatRupiahCompact(-3_500_000, "en", en.calc.unit, en.calc.result.beyond)).toBe(`${MINUS}Rp${NBSP}3.5 million`);
  expect(formatRupiahCompact(999_999, "id", id.calc.unit, id.calc.result.beyond)).toBe(`Rp${NBSP}999.999`);
  expect(formatRupiahCompact(0, "en", en.calc.unit, en.calc.result.beyond)).toBe(`Rp${NBSP}0`);
});

test("formatRupiahCompact: from Rp 1,000 trillion upwards it says so, never a long number or an exponent", () => {
  const compact = (value: number, locale: "en" | "id") =>
    formatRupiahCompact(value, locale, (locale === "en" ? en : id).calc.unit, (locale === "en" ? en : id).calc.result.beyond);
  // Just below: the normal form.
  expect(compact(9.99e14, "en")).toBe(`Rp${NBSP}999.00 trillion`);
  expect(compact(9.99e14, "id")).toBe(`Rp${NBSP}999,00 triliun`);
  // The boundary and far beyond it.
  for (const value of [1e15, 3.5e48, Number.MAX_VALUE, Infinity]) {
    expect(compact(value, "en"), String(value)).toBe("more than Rp 1,000 trillion");
    expect(compact(value, "id"), String(value)).toBe("lebih dari Rp 1.000 triliun");
  }
  // A loss gets the minus sign (U+2212).
  expect(compact(-1e15, "en")).toBe(`${MINUS}more than Rp 1,000 trillion`);
  expect(compact(-3.5e48, "id")).toBe(`${MINUS}lebih dari Rp 1.000 triliun`);
  for (const value of [3.5e48, -3.5e48, 1e15, 1e21]) expect(compact(value, "en")).not.toMatch(/e\+|\d{4,}/);
});

test("formatUsd", () => {
  expect(formatUsd(1234.5, "en")).toBe("$1,234.50");
  expect(formatUsd(1234.5, "id")).toBe("US$1.234,50");
  expect(formatUsd(-1234.5, "en")).toBe(`${MINUS}$1,234.50`);
  expect(formatUsd(0, "en")).toBe("$0.00");
});

test("formatPercent", () => {
  expect(formatPercent(0.024, "en")).toBe("+2.4%");
  expect(formatPercent(0.024, "id")).toBe("+2,4%");
  expect(formatPercent(-0.062, "en")).toBe(`${MINUS}6.2%`);
  expect(formatPercent(-0.062, "id")).toBe(`${MINUS}6,2%`);
  expect(formatPercent(0, "en")).toBe("0%");
  expect(formatPercent(0, "id")).toBe("0%");
  expect(formatPercent(-0.0001, "en")).toBe("0%");
});

test("formatDateTimeWib rolls the date over at WIB midnight", () => {
  expect(formatDateTimeWib("2026-10-03T17:30:00Z", "en")).toBe("4 Oct 2026, 00:30 WIB");
  expect(formatDateTimeWib("2026-10-03T17:30:00Z", "id")).toBe("4 Okt 2026, 00.30 WIB");
  expect(formatDateTimeWib(new Date("2026-10-03T16:59:00Z"), "en")).toBe("3 Oct 2026, 23:59 WIB");
});

test("formatTimeWib and formatDateShortWib read the WIB clock", () => {
  expect(formatTimeWib("2026-10-03T02:30:00Z", "en")).toBe("09:30");
  expect(formatTimeWib("2026-10-03T02:30:00Z", "id")).toBe("09.30");
  expect(formatDateShortWib("2026-10-03T02:30:00Z", "en")).toBe("3 Oct");
  expect(formatDateShortWib("2026-10-03T02:30:00Z", "id")).toBe("3 Okt");
  // 17:30 UTC is already the next day in WIB, and midnight reads 00, not 24.
  expect(formatTimeWib("2026-10-03T17:05:00Z", "en")).toBe("00:05");
  expect(formatDateShortWib("2026-10-03T17:05:00Z", "en")).toBe("4 Oct");
  expect(formatTimeWib("2026-10-03T16:59:00Z", "id")).toBe("23.59");
  expect(formatTimeWib(null, "en")).toBe(DASH);
  expect(formatDateShortWib("not a date", "id")).toBe(DASH);
});

test("formatDateLongWib: weekday, day, month and year in WIB", () => {
  expect(formatDateLongWib("2026-10-03T02:30:00Z", "en")).toBe("Saturday, 3 October 2026");
  expect(formatDateLongWib("2026-10-03T02:30:00Z", "id")).toBe("Sabtu, 3 Oktober 2026");
  // 17:05 UTC is already the next day in WIB.
  expect(formatDateLongWib("2026-10-03T17:05:00Z", "en")).toBe("Sunday, 4 October 2026");
  expect(formatDateLongWib("2026-10-03T17:05:00Z", "id")).toBe("Minggu, 4 Oktober 2026");
  expect(formatDateLongWib(null, "en")).toBe(DASH);
  expect(formatDateLongWib("not a date", "id")).toBe(DASH);
});

describe("formatRelativeTime", () => {
  const now = new Date("2026-10-03T12:00:00Z");
  const ago = (seconds: number) => new Date(now.getTime() - seconds * 1000);
  const MIN = 60;
  const HOUR = 60 * MIN;
  const DAY = 24 * HOUR;

  test.each([
    ["59 s", 59, "just now", "baru saja"],
    ["60 s", 60, "1m ago", "1 mnt lalu"],
    ["59 min", 59 * MIN, "59m ago", "59 mnt lalu"],
    ["60 min", 60 * MIN, "1h ago", "1 jam lalu"],
    ["23 h", 23 * HOUR, "23h ago", "23 jam lalu"],
    ["24 h", 24 * HOUR, "1d ago", "1 hari lalu"],
    ["6 days", 6 * DAY, "6d ago", "6 hari lalu"],
    ["7 days", 7 * DAY, "26 Sep", "26 Sep"],
    ["8 days", 8 * DAY, "25 Sep", "25 Sep"],
    ["in the future", -5 * MIN, "just now", "baru saja"],
  ])("%s", (_label, seconds, inEn, inId) => {
    expect(formatRelativeTime(ago(seconds), now, "en", en.time)).toBe(inEn);
    expect(formatRelativeTime(ago(seconds), now, "id", id.time)).toBe(inId);
  });

  test("an earlier year shows the year", () => {
    expect(formatRelativeTime("2025-12-31T05:00:00Z", now, "en", en.time)).toBe("31 Dec 2025");
    expect(formatRelativeTime("2025-12-31T05:00:00Z", now, "id", id.time)).toBe("31 Des 2025");
  });
});

test("missing values show an em dash", () => {
  for (const value of [null, undefined, NaN]) {
    expect(formatRupiah(value, "en")).toBe(DASH);
    expect(formatRupiahCompact(value, "en", en.calc.unit, en.calc.result.beyond)).toBe(DASH);
    expect(formatUsd(value, "id")).toBe(DASH);
    expect(formatPercent(value, "en")).toBe(DASH);
  }
  expect(formatDateTimeWib(null, "en")).toBe(DASH);
  expect(formatDateTimeWib("not a date", "id")).toBe(DASH);
  expect(formatRelativeTime(undefined, new Date(), "en", en.time)).toBe(DASH);
});

describe("formatUsdPrice", () => {
  test("whole dollars from 1,000 up, cents below", () => {
    expect(formatUsdPrice(98400, "en")).toBe("$98,400");
    expect(formatUsdPrice(98400.5, "id")).toBe("US$98.401");
    expect(formatUsdPrice(1000, "en")).toBe("$1,000");
    expect(formatUsdPrice(999.99, "en")).toBe("$999.99");
    expect(formatUsdPrice(2.5, "id")).toBe("US$2,50");
    expect(formatUsdPrice(null, "en")).toBe(DASH);
  });
});

describe("formatNumber", () => {
  test("a plain grouped number in the locale's style", () => {
    expect(formatNumber(7412.4, "en")).toBe("7,412");
    expect(formatNumber(7412.4, "id")).toBe("7.412");
    expect(formatNumber(16240.5, "en", 2)).toBe("16,240.50");
    expect(formatNumber(16240.5, "id", 2)).toBe("16.240,50");
    expect(formatNumber(undefined, "en")).toBe(DASH);
  });
});

describe("formatChange", () => {
  test("the unsigned size with one decimal and the direction", () => {
    expect(formatChange(0.012, "en")).toEqual({ direction: "up", text: "1.2%" });
    expect(formatChange(0.012, "id")).toEqual({ direction: "up", text: "1,2%" });
    expect(formatChange(-0.008, "en")).toEqual({ direction: "down", text: "0.8%" });
    expect(formatChange(-0.008, "id")).toEqual({ direction: "down", text: "0,8%" });
    expect(formatChange(0.1234, "en")).toEqual({ direction: "up", text: "12.3%" });
  });

  test("zero and anything that rounds to zero is flat, as 0.0% / 0,0%", () => {
    expect(formatChange(0, "en")).toEqual({ direction: "flat", text: "0.0%" });
    expect(formatChange(0, "id")).toEqual({ direction: "flat", text: "0,0%" });
    expect(formatChange(0.0003, "en")).toEqual({ direction: "flat", text: "0.0%" });
    expect(formatChange(-0.0003, "id")).toEqual({ direction: "flat", text: "0,0%" });
    expect(formatChange(-0, "en")).toEqual({ direction: "flat", text: "0.0%" });
  });

  test("missing values give null", () => {
    expect(formatChange(null, "en")).toBeNull();
    expect(formatChange(Number.NaN, "id")).toBeNull();
  });
});
