import { describe, expect, test } from "vitest";
import en from "@/i18n/dictionaries/en.json";
import id from "@/i18n/dictionaries/id.json";
import { affectedText, briefSourceText, firstRunTime, plural, sectionStale, staleText, updatedText } from "./view";

describe("plural", () => {
  test("one for exactly 1, other for everything else (0 included)", () => {
    expect(plural(1, en.radar.brief.articles)).toBe("1 article");
    expect(plural(0, en.radar.brief.articles)).toBe("0 articles");
    expect(plural(112, en.radar.brief.articles)).toBe("112 articles");
    expect(plural(1, id.radar.brief.articles)).toBe("1 artikel");
    expect(plural(2, id.radar.brief.articles)).toBe("2 artikel");
  });
});

describe("affectedText", () => {
  test("nothing for 0, singular for 1, plural above", () => {
    expect(affectedText(0, en.radar.brief.affected)).toBeNull();
    expect(affectedText(1, en.radar.brief.affected)).toBe("1 opportunity affected");
    expect(affectedText(2, en.radar.brief.affected)).toBe("2 opportunities affected");
    expect(affectedText(1, id.radar.brief.affected)).toBe("1 peluang terdampak");
    expect(affectedText(3, id.radar.brief.affected)).toBe("3 peluang terdampak");
  });
});

describe("briefSourceText", () => {
  test("articles and sources each take their own plural form", () => {
    expect(briefSourceText(112, 14, en.radar.brief)).toBe("AI summary of 112 articles from 14 sources");
    expect(briefSourceText(10, 1, en.radar.brief)).toBe("AI summary of 10 articles from 1 source");
    expect(briefSourceText(112, 14, id.radar.brief)).toBe("Ringkasan AI dari 112 artikel, 14 sumber");
  });
});

describe("updatedText", () => {
  test("date and time, or the date alone without a morning run", () => {
    expect(updatedText("Saturday, 3 October 2026", "07:00", en.radar.updated)).toBe("Saturday, 3 October 2026 · updated 07:00 WIB");
    expect(updatedText("Sabtu, 3 Oktober 2026", "07.00", id.radar.updated)).toBe("Sabtu, 3 Oktober 2026 · diperbarui 07.00 WIB");
    expect(updatedText("Saturday, 3 October 2026", null, en.radar.updated)).toBe("Saturday, 3 October 2026");
  });
});

describe("sectionStale", () => {
  const now = new Date("2026-10-04T05:00:00Z"); // 12:00 WIB
  const ago = (hours: number) => new Date(now.getTime() - hours * 3600_000);

  test("exactly 26 hours is fresh, a minute more is stale, and never run says nothing", () => {
    expect(sectionStale(ago(26), now, "en", en.state.stale, "brief")).toBeNull();
    expect(sectionStale(new Date(ago(26).getTime() - 60_000), now, "en", en.state.stale, "brief")).not.toBeNull();
    expect(sectionStale(null, now, "en", en.state.stale, "brief")).toBeNull();
  });

  test("names the section and the WIB date and time, in both languages", () => {
    const run = new Date("2026-10-02T23:30:00Z"); // 3 Oct, 06:30 WIB
    expect(sectionStale(run, now, "en", en.state.stale, "brief")).toBe("The daily brief last updated 3 Oct, 06:30 WIB");
    expect(sectionStale(run, now, "en", en.state.stale, "opportunities")).toBe("Opportunities last updated 3 Oct, 06:30 WIB");
    expect(sectionStale(run, now, "id", id.state.stale, "brief")).toBe("Ringkasan harian terakhir diperbarui 3 Okt, 06.30 WIB");
  });
});

describe("sectionStale for prices", () => {
  const now = new Date("2026-10-04T05:00:00Z"); // 12:00 WIB
  const run = new Date("2026-10-02T23:30:00Z"); // 3 Oct, 06:30 WIB, more than 26 hours ago

  test("names the prices in both languages", () => {
    expect(sectionStale(run, now, "en", en.state.stale, "prices")).toBe("Prices last updated 3 Oct, 06:30 WIB");
    expect(sectionStale(run, now, "id", id.state.stale, "prices")).toBe("Harga terakhir diperbarui 3 Okt, 06.30 WIB");
    expect(sectionStale(new Date(now.getTime() - 3600_000), now, "en", en.state.stale, "prices")).toBeNull(); // 26-hour rule
  });
});

describe("sectionStale for ventures", () => {
  const now = new Date("2026-10-04T05:00:00Z"); // 12:00 WIB
  const run = new Date("2026-10-02T23:30:00Z"); // 3 Oct, 06:30 WIB, more than 26 hours ago

  test("names the venture data in both languages; fresh or never run says nothing", () => {
    expect(sectionStale(run, now, "en", en.state.stale, "ventures")).toBe("Venture data last updated 3 Oct, 06:30 WIB");
    expect(sectionStale(run, now, "id", id.state.stale, "ventures")).toBe("Data usaha terakhir diperbarui 3 Okt, 06.30 WIB");
    expect(sectionStale(new Date(now.getTime() - 25 * 3600_000), now, "en", en.state.stale, "ventures")).toBeNull();
    expect(sectionStale(null, now, "en", en.state.stale, "ventures")).toBeNull();
  });
});

describe("staleText", () => {
  const now = new Date("2026-10-04T05:00:00Z"); // 4 Oct, 12:00 WIB

  test("a run from today (WIB) shows the time only, an earlier day the date and time", () => {
    expect(staleText(new Date("2026-10-04T02:30:00Z"), now, "en", en.state.stale, "prices")).toBe("Prices last updated 09:30 WIB");
    expect(staleText(new Date("2026-10-04T02:30:00Z"), now, "id", id.state.stale, "prices")).toBe("Harga terakhir diperbarui 09.30 WIB");
    expect(staleText(new Date("2026-10-03T16:59:00Z"), now, "en", en.state.stale, "prices")).toBe("Prices last updated 3 Oct, 23:59 WIB");
  });

  test("the WIB day decides, not the UTC day: 17:00Z is already tomorrow in WIB", () => {
    const late = new Date("2026-10-04T18:00:00Z"); // 5 Oct, 01:00 WIB
    expect(staleText(new Date("2026-10-04T17:30:00Z"), late, "en", en.state.stale, "prices")).toBe("Prices last updated 00:30 WIB");
    expect(staleText(new Date("2026-10-04T16:30:00Z"), late, "en", en.state.stale, "prices")).toBe("Prices last updated 4 Oct, 23:30 WIB");
  });
});

describe("firstRunTime", () => {
  test("is 07:00 WIB, written the way each language writes a time", () => {
    expect(firstRunTime("en")).toBe("07:00");
    expect(firstRunTime("id")).toBe("07.00");
  });
});
