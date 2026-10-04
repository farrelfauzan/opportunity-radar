import { describe, expect, test } from "vitest";
import en from "@/i18n/dictionaries/en.json";
import id from "@/i18n/dictionaries/id.json";
import { barPercent, factorRows, FACTORS, inLocale, isNeverScored, isStale, opportunityMeta, staleBanner, STALE_AFTER_MS, trendText } from "./view";

const now = new Date("2026-10-03T12:00:00Z"); // 19:00 WIB
const ago = (ms: number) => new Date(now.getTime() - ms);

describe("isStale", () => {
  test("no run at all is not stale (that is the never-scored state)", () => {
    expect(isStale(null, now)).toBe(false);
  });

  test("exactly 26 hours is fresh, one millisecond more is stale", () => {
    expect(STALE_AFTER_MS).toBe(26 * 3600_000);
    expect(isStale(ago(STALE_AFTER_MS), now)).toBe(false);
    expect(isStale(ago(STALE_AFTER_MS + 1), now)).toBe(true);
    expect(isStale(ago(2 * 3600_000), now)).toBe(false);
    expect(isStale(ago(30 * 3600_000), now)).toBe(true);
  });
});

describe("isNeverScored", () => {
  test("needs no run and no opportunities", () => {
    expect(isNeverScored(null, 0)).toBe(true);
    expect(isNeverScored(null, 2)).toBe(false);
    expect(isNeverScored(now, 0)).toBe(false);
  });
});

describe("staleBanner", () => {
  test("none while fresh or when there was no run", () => {
    expect(staleBanner(ago(STALE_AFTER_MS), now, "en", en.state.stale)).toBeNull();
    expect(staleBanner(null, now, "en", en.state.stale)).toBeNull();
  });

  test("an earlier WIB day adds the date, in both languages", () => {
    const lastRun = new Date("2026-10-02T00:00:00Z"); // 2 Oct 07:00 WIB, 36 h ago
    expect(staleBanner(lastRun, now, "en", en.state.stale)).toBe("Opportunities last updated 2 Oct, 07:00 WIB");
    expect(staleBanner(lastRun, now, "id", id.state.stale)).toBe("Peluang terakhir diperbarui 2 Okt, 07.00 WIB");
  });

  test("it is always the dated form: 26 hours ago is never the same WIB day", () => {
    const lastRun = new Date(now.getTime() - STALE_AFTER_MS - 1);
    expect(staleBanner(lastRun, now, "en", en.state.stale)).toBe("Opportunities last updated 2 Oct, 16:59 WIB");
  });
});

describe("trendText", () => {
  test("a rise, a fall, no change and a new opportunity each have a symbol or word", () => {
    expect(trendText({ kind: "change", delta: 9 }, en.opp.trend)).toEqual({ text: "▲ 9", direction: "up" });
    expect(trendText({ kind: "change", delta: -3 }, en.opp.trend)).toEqual({ text: "▼ 3", direction: "down" });
    expect(trendText({ kind: "change", delta: 0 }, en.opp.trend)).toEqual({ text: "— 0", direction: "flat" });
    expect(trendText({ kind: "new" }, en.opp.trend)).toEqual({ text: "New", direction: "new" });
    expect(trendText({ kind: "new" }, id.opp.trend).text).toBe("Baru");
  });
});

describe("score breakdown", () => {
  test("a bar is the score as whole percent, kept within 0 to 100", () => {
    expect([0, 1, 49.6, 100].map(barPercent)).toEqual([0, 1, 50, 100]);
    expect([-5, 130].map(barPercent)).toEqual([0, 100]);
  });

  test("the rows come in display order with the stored number of each factor", () => {
    expect(FACTORS).toEqual(["demand", "timing", "competition", "capital", "regulatory"]);
    expect(factorRows({ demand: 80, timing: 70, competition: 60, capital: 50, regulatory: 40 })).toEqual([
      { factor: "demand", value: 80 },
      { factor: "timing", value: 70 },
      { factor: "competition", value: 60 },
      { factor: "capital", value: 50 },
      { factor: "regulatory", value: 40 },
    ]);
  });

  test("no score row gives no rows (never invented numbers)", () => {
    expect(factorRows(null)).toEqual([]);
  });

  test("every factor has a label in both languages", () => {
    for (const factor of FACTORS) {
      expect(en.opp.factor[factor]).toBeTruthy();
      expect(id.opp.factor[factor]).toBeTruthy();
    }
  });
});

describe("text helpers", () => {
  test("inLocale picks the column of the page language", () => {
    expect(inLocale("en", "a", "b")).toBe("a");
    expect(inLocale("id", "a", "b")).toBe("b");
  });

  test("opportunityMeta is region, sectors and horizon in the page language", () => {
    const item = { region: "indonesia", sectors: ["logistics", "fisheries_maritime"], horizon: "6-12m" } as Parameters<
      typeof opportunityMeta
    >[0];
    expect(opportunityMeta(item, en)).toBe("Indonesia · Logistics & Supply Chain, Fisheries & Maritime · Horizon 6–12 months");
    expect(opportunityMeta({ ...item, region: "global" }, id)).toContain("Global · Logistik & Rantai Pasok");
  });
});
