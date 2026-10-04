import { describe, expect, test } from "vitest";
import en from "@/i18n/dictionaries/en.json";
import id from "@/i18n/dictionaries/id.json";
import { neverScored, progressPercent, scoreChange } from "./view";

describe("progressPercent", () => {
  test("rounds to a whole percent and clamps to 0-100", () => {
    expect(progressPercent(62)).toBe(62);
    expect(progressPercent(61.6)).toBe(62);
    expect(progressPercent(0)).toBe(0);
    expect(progressPercent(100)).toBe(100);
    expect(progressPercent(-5)).toBe(0);
    expect(progressPercent(140)).toBe(100);
  });
});

describe("scoreChange", () => {
  test("a symbol and a number, never colour alone: up, down and unchanged", () => {
    expect(scoreChange(5, en.opp.trend)).toEqual({ text: "▲ 5", direction: "up" });
    expect(scoreChange(-2, en.opp.trend)).toEqual({ text: "▼ 2", direction: "down" });
    expect(scoreChange(0, en.opp.trend)).toEqual({ text: "— 0", direction: "flat" });
    expect(scoreChange(3, id.opp.trend)).toEqual({ text: "▲ 3", direction: "up" });
  });

  test("nothing to say without a change (the day before has no row)", () => {
    expect(scoreChange(null, en.opp.trend)).toBeNull();
  });
});

describe("neverScored", () => {
  const row = { score: null };
  test("only when no market row and no winds exist", () => {
    expect(neverScored({ indonesia: null, global: null }, null)).toBe(true);
    expect(neverScored({ indonesia: row, global: null }, null)).toBe(false);
    expect(neverScored({ indonesia: null, global: row }, null)).toBe(false);
    expect(neverScored({ indonesia: null, global: null }, {})).toBe(false);
  });
});
