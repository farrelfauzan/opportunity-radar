import { describe, expect, test } from "vitest";
import en from "@/i18n/dictionaries/en.json";
import id from "@/i18n/dictionaries/id.json";
import { isNeverScored, isStale, staleBanner, STALE_AFTER_MS, trendText } from "./view";

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
