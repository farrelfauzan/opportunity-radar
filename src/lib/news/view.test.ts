import { describe, expect, test } from "vitest";
import en from "@/i18n/dictionaries/en.json";
import id from "@/i18n/dictionaries/id.json";
import { isNeverIngested, isStale, safeHref, staleBanner, STALE_AFTER_MS } from "./view";

const now = new Date("2026-10-03T12:00:00Z"); // 19:00 WIB
const ago = (ms: number) => new Date(now.getTime() - ms);

describe("isStale", () => {
  test("no run at all is not stale (that is the never-ingested state)", () => {
    expect(isStale(null, now)).toBe(false);
  });

  test("exactly 2 hours is fresh, one millisecond more is stale", () => {
    expect(isStale(ago(STALE_AFTER_MS), now)).toBe(false);
    expect(isStale(ago(STALE_AFTER_MS + 1), now)).toBe(true);
    expect(isStale(ago(60_000), now)).toBe(false);
    expect(isStale(ago(3 * 60 * 60 * 1000), now)).toBe(true);
  });

  test("a run in the future is fresh", () => {
    expect(isStale(new Date(now.getTime() + 60_000), now)).toBe(false);
  });
});

describe("isNeverIngested", () => {
  test("needs no run and no articles", () => {
    expect(isNeverIngested(null, 0)).toBe(true);
    expect(isNeverIngested(null, 3)).toBe(false);
    expect(isNeverIngested(now, 0)).toBe(false);
  });
});

describe("staleBanner", () => {
  test("none while fresh or when there was no run", () => {
    expect(staleBanner(ago(STALE_AFTER_MS), now, "en", en.state.stale)).toBeNull();
    expect(staleBanner(null, now, "en", en.state.stale)).toBeNull();
  });

  test("the same WIB day shows the time only", () => {
    const lastRun = new Date("2026-10-03T02:30:00Z"); // 09:30 WIB, 9.5 h ago
    expect(staleBanner(lastRun, now, "en", en.state.stale)).toBe("News last updated 09:30 WIB");
    expect(staleBanner(lastRun, now, "id", id.state.stale)).toBe("Berita terakhir diperbarui 09.30 WIB");
  });

  test("the WIB day decides, not the UTC day", () => {
    const lastRun = new Date("2026-10-02T17:10:00Z"); // 3 Oct 00:10 WIB, still the WIB day of `now`
    expect(staleBanner(lastRun, now, "en", en.state.stale)).toBe("News last updated 00:10 WIB");
  });

  test("an earlier WIB day adds the date", () => {
    const lastRun = new Date("2026-10-02T16:50:00Z"); // 2 Oct 23:50 WIB
    expect(staleBanner(lastRun, now, "en", en.state.stale)).toBe("News last updated 2 Oct, 23:50 WIB");
    expect(staleBanner(lastRun, now, "id", id.state.stale)).toBe("Berita terakhir diperbarui 2 Okt, 23.50 WIB");
  });
});

describe("safeHref", () => {
  test("only http(s) links become an href", () => {
    expect(safeHref("https://example.com/a?b=1")).toBe("https://example.com/a?b=1");
    expect(safeHref("http://example.com/")).toBe("http://example.com/");
    expect(safeHref("HTTPS://Example.com/x")).toBe("https://example.com/x");
  });

  test.each([
    "javascript:alert(1)",
    " javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "java\tscript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
    "ftp://example.com/",
    "//example.com/x",
    "/relative/path",
    "example.com",
    "",
    "not a url",
  ])("rejects %j", (link) => {
    expect(safeHref(link)).toBeNull();
  });
});
