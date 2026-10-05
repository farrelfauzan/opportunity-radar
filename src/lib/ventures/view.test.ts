import { describe, expect, test } from "vitest";
import en from "@/i18n/dictionaries/en.json";
import id from "@/i18n/dictionaries/id.json";
import {
  deltaLabel,
  neverScored,
  NEWS_PAGE_SIZE,
  parseShown,
  progressPercent,
  progressSentence,
  scoreAsOf,
  scoreChange,
  seriesView,
  ventureHref,
} from "./view";

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

describe("deltaLabel", () => {
  test("up, down (singular and plural) and unchanged, in points and never percent", () => {
    expect(deltaLabel(5, en.radar.ventures)).toBe("up 5 points vs yesterday");
    expect(deltaLabel(1, en.radar.ventures)).toBe("up 1 point vs yesterday");
    expect(deltaLabel(-2, en.radar.ventures)).toBe("down 2 points vs yesterday");
    expect(deltaLabel(-1, en.radar.ventures)).toBe("down 1 point vs yesterday");
    expect(deltaLabel(0, en.radar.ventures)).toBe("unchanged vs yesterday");
    expect(deltaLabel(5, id.radar.ventures)).toBe("naik 5 poin dibanding kemarin");
    expect(deltaLabel(-1, id.radar.ventures)).toBe("turun 1 poin dibanding kemarin");
    expect(deltaLabel(0, id.radar.ventures)).toBe("tidak berubah dibanding kemarin");
  });
});

describe("scoreAsOf", () => {
  // 2026-10-04 23:59:59 WIB, and one second later: the next WIB day.
  const lastSecond = new Date("2026-10-04T16:59:59Z");
  const midnight = new Date("2026-10-04T17:00:00Z");
  const t = en.radar.ventures.scoreAsOf;

  test("nothing for a score of today or yesterday (WIB)", () => {
    expect(scoreAsOf("2026-10-04", lastSecond, "en", t)).toBeNull();
    expect(scoreAsOf("2026-10-03", lastSecond, "en", t)).toBeNull();
  });

  test("an older day is written out, in the locale", () => {
    expect(scoreAsOf("2026-10-02", lastSecond, "en", t)).toBe("As of 2 Oct");
    expect(scoreAsOf("2026-09-20", lastSecond, "id", id.radar.ventures.scoreAsOf)).toBe("Per 20 Sep");
  });

  test("at WIB midnight the day before yesterday starts to show: yesterday moves a day on", () => {
    expect(scoreAsOf("2026-10-04", midnight, "en", t)).toBeNull(); // yesterday now
    expect(scoreAsOf("2026-10-03", midnight, "en", t)).toBe("As of 3 Oct");
    expect(scoreAsOf("2026-10-05", midnight, "en", t)).toBeNull(); // today
  });

  test("a UTC date that is still the day before in WIB does not shift the day", () => {
    // 2026-10-05 01:00 UTC is 08:00 WIB on the 5th.
    expect(scoreAsOf("2026-10-03", new Date("2026-10-05T01:00:00Z"), "en", t)).toBe("As of 3 Oct");
    expect(scoreAsOf("2026-10-04", new Date("2026-10-05T01:00:00Z"), "en", t)).toBeNull();
  });
});

describe("progressSentence", () => {
  const strings = { en: en.venture.progress, id: id.venture.progress };

  test("all three parts joined with ' · '", () => {
    expect(progressSentence({ sprintDelivered: 3, sprintNext: 4, ticketsInQa: 4 }, strings.en)).toBe("Sprint 3 delivered · Next: sprint 4 · 4 tickets in QA");
    expect(progressSentence({ sprintDelivered: 3, sprintNext: 4, ticketsInQa: 4 }, strings.id)).toBe("Sprint 3 selesai · Berikutnya: sprint 4 · 4 tiket di QA");
  });

  test("the QA part is singular at one and plural at zero", () => {
    expect(progressSentence({ sprintDelivered: null, sprintNext: null, ticketsInQa: 1 }, strings.en)).toBe("1 ticket in QA");
    expect(progressSentence({ sprintDelivered: null, sprintNext: null, ticketsInQa: 0 }, strings.en)).toBe("0 tickets in QA");
  });

  test("a part without data is left out, with no stray separator", () => {
    expect(progressSentence({ sprintDelivered: 3, sprintNext: null, ticketsInQa: 2 }, strings.en)).toBe("Sprint 3 delivered · 2 tickets in QA");
    expect(progressSentence({ sprintDelivered: null, sprintNext: 4, ticketsInQa: null }, strings.en)).toBe("Next: sprint 4");
    expect(progressSentence({ sprintDelivered: 0, sprintNext: null, ticketsInQa: null }, strings.en)).toBe("Sprint 0 delivered"); // zero is data
  });

  test("no data at all: no sentence", () => {
    expect(progressSentence({ sprintDelivered: null, sprintNext: null, ticketsInQa: null }, strings.en)).toBeNull();
  });
});

describe("seriesView", () => {
  const point = (day: number, score: number) => ({ day: `2026-10-${String(day).padStart(2, "0")}`, score });

  test("the line and its hidden summary count the points drawn: first and last score", () => {
    const view = seriesView([point(1, 60), point(3, 66), point(5, 70)], en.venture.market)!;
    expect(view.summary).toBe("Last 3 days: from 60 to 70");
    expect(view.points.split(" ")).toHaveLength(3);
    expect(seriesView([point(1, 60), point(2, 61)], id.venture.market)!.summary).toBe("2 hari terakhir: dari 60 ke 61");
  });

  test("the line rises with the score: a higher score has a smaller y", () => {
    const [first, , last] = seriesView([point(1, 60), point(2, 65), point(3, 70)], en.venture.market)!.points.split(" ").map((p) => Number(p.split(",")[1]));
    expect(last).toBeLessThan(first);
  });

  test("a flat series is a straight line", () => {
    const ys = new Set(seriesView([point(1, 50), point(2, 50), point(3, 50)], en.venture.market)!.points.split(" ").map((p) => p.split(",")[1]));
    expect(ys.size).toBe(1);
  });

  test("under two points: nothing to draw and no summary", () => {
    expect(seriesView([], en.venture.market)).toBeNull();
    expect(seriesView([point(1, 60)], en.venture.market)).toBeNull();
  });
});

describe("parseShown and ventureHref", () => {
  test("?shown= falls back to the first page for anything but a whole number, and never goes below it", () => {
    expect(parseShown(undefined)).toBe(NEWS_PAGE_SIZE);
    expect(parseShown("abc")).toBe(NEWS_PAGE_SIZE);
    expect(parseShown(["40", "60"])).toBe(NEWS_PAGE_SIZE);
    expect(parseShown("-5")).toBe(NEWS_PAGE_SIZE);
    expect(parseShown("5")).toBe(NEWS_PAGE_SIZE);
    expect(parseShown("40")).toBe(40);
    expect(parseShown("999999")).toBe(NEWS_PAGE_SIZE); // not a 1-4 digit number
    expect(parseShown("5000")).toBe(1000);
  });

  test("the URL leaves out the first page's ?shown=", () => {
    expect(ventureHref("en", "performa-vision")).toBe("/en/ventures/performa-vision");
    expect(ventureHref("id", "meta-klinik", 20)).toBe("/id/ventures/meta-klinik");
    expect(ventureHref("en", "meta-klinik", 40)).toBe("/en/ventures/meta-klinik?shown=40");
  });
});
