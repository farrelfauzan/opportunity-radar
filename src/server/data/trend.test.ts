import { describe, expect, test } from "vitest";
import { addDays, computeTrend, daysBetween } from "./trend";

const today = "2026-10-04";

describe("calendar days", () => {
  test("addDays and daysBetween agree across month ends and leap years", () => {
    expect(addDays("2026-10-04", -30)).toBe("2026-09-04");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2028-03-01", -1)).toBe("2028-02-29");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(daysBetween("2026-09-04", "2026-10-04")).toBe(30);
    expect(daysBetween("2026-10-04", "2026-10-04")).toBe(0);
  });

  test("a day that is not YYYY-MM-DD is rejected", () => {
    expect(() => addDays("2026-10-4", 1)).toThrow("YYYY-MM-DD");
  });
});

describe("computeTrend", () => {
  test("first scored today to 29 days ago is new", () => {
    for (const age of [0, 1, 3, 29]) {
      expect(computeTrend({ today, firstDay: addDays(today, -age), latest: 70, baseline: age === 0 ? null : 60 })).toEqual({
        kind: "new",
      });
    }
  });

  test("first scored 30 days ago shows the change since that first score", () => {
    expect(computeTrend({ today, firstDay: addDays(today, -30), latest: 70, baseline: 61 })).toEqual({
      kind: "change",
      delta: 9,
    });
  });

  test("with a long history the change is latest minus the baseline: up, down, flat", () => {
    const firstDay = addDays(today, -45);
    expect(computeTrend({ today, firstDay, latest: 80, baseline: 68 })).toEqual({ kind: "change", delta: 12 });
    expect(computeTrend({ today, firstDay, latest: 62, baseline: 70 })).toEqual({ kind: "change", delta: -8 });
    expect(computeTrend({ today, firstDay, latest: 73, baseline: 73 })).toEqual({ kind: "change", delta: 0 });
  });

  test("no score at all, or no row to compare with, is new", () => {
    expect(computeTrend({ today, firstDay: null, latest: 50, baseline: null })).toEqual({ kind: "new" });
    expect(computeTrend({ today, firstDay: addDays(today, -40), latest: 50, baseline: null })).toEqual({ kind: "new" });
  });
});
