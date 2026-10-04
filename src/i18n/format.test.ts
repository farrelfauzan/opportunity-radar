import { describe, expect, test } from "vitest";
import en from "./dictionaries/en.json";
import id from "./dictionaries/id.json";
import {
  formatDateTimeWib,
  formatPercent,
  formatRelativeTime,
  formatRupiah,
  formatUsd,
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
    expect(formatUsd(value, "id")).toBe(DASH);
    expect(formatPercent(value, "en")).toBe(DASH);
  }
  expect(formatDateTimeWib(null, "en")).toBe(DASH);
  expect(formatDateTimeWib("not a date", "id")).toBe(DASH);
  expect(formatRelativeTime(undefined, new Date(), "en", en.time)).toBe(DASH);
});
