import { describe, expect, test } from "vitest";
import { readFixture, readFixtureBytes } from "../../../tests/fixtures";
import { FEEDS } from "./feeds";
import { parseFeedDate, toArticle } from "./ingest";
import { decodeFeed, FeedError, parseFeed } from "./parse";

const fetchedAt = new Date("2026-10-04T02:00:00Z");
const feed = FEEDS[0];
const articles = (fixture: string) =>
  parseFeed(readFixture(fixture)).map((item) => toArticle(item, feed, 1, fetchedAt));

describe("parseFeed", () => {
  test("RSS 2.0: title, link, description and date of every item", () => {
    const items = parseFeed(readFixture("synthetic/rss.xml"));
    expect(items).toHaveLength(8);
    expect(items[0]).toEqual({
      title: "Plain RSS item",
      link: "https://example.com/news/plain",
      description: "A plain description.",
      date: "Sat, 03 Oct 2026 17:30:00 +0700",
    });
  });

  test("Atom: the alternate link, summary and published date", () => {
    const [first, second] = parseFeed(readFixture("synthetic/atom.xml"));
    expect(first).toMatchObject({ link: "https://example.org/posts/1", date: "2026-10-03T08:00:00+07:00" });
    expect(second).toMatchObject({ link: "https://example.org/posts/2", description: "", date: "2026-10-03T02:00:00Z" });
  });

  test("an empty feed has no items", () => {
    expect(parseFeed(readFixture("synthetic/empty.xml"))).toEqual([]);
  });

  test("malformed XML is a readable failure", () => {
    expect(() => parseFeed(readFixture("synthetic/malformed.xml"))).toThrow(new FeedError("malformed XML"));
  });

  test("an external-entity DOCTYPE is refused as unsupported XML, not read", () => {
    const xxe = `<?xml version="1.0"?>
<!DOCTYPE rss [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>
<rss version="2.0"><channel><title>&xxe;</title></channel></rss>`;
    expect(() => parseFeed(xxe)).toThrow(new FeedError("unsupported XML"));
  });

  test("an HTML page served with 200 is not a feed", () => {
    expect(() => parseFeed(readFixture("synthetic/challenge.html"))).toThrow("not a feed (HTML page)");
    expect(() => parseFeed("<?xml version='1.0'?><note><to>x</to></note>")).toThrow("not a feed");
  });
});

describe("decodeFeed", () => {
  test("a feed that is not UTF-8 is decoded with its declared charset", () => {
    const xml = decodeFeed(readFixtureBytes("synthetic/latin1.xml"), "text/xml");
    expect(parseFeed(xml)[0].title).toBe("Café société: crédit à la hausse");
  });

  test("without an XML declaration the HTTP header's charset is used", () => {
    const body = new Uint8Array([0x3c, 0x61, 0x3e, 0xe9, 0x3c, 0x2f, 0x61, 0x3e]).buffer; // <a>é</a> in Latin-1
    expect(decodeFeed(body, "text/xml; charset=iso-8859-1")).toBe("<a>é</a>");
  });

  test("the XML declaration wins over a wrong header (Katadata says iso-8859-1, sends UTF-8)", () => {
    const xml = decodeFeed(readFixtureBytes("katadata/feed-2026-10-04.xml"), "text/xml;charset=iso-8859-1");
    expect(xml).not.toContain("Ã");
  });
});

describe("parseFeedDate", () => {
  test.each([
    ["Sat, 03 Oct 2026 17:30:00 +0700", "2026-10-03T10:30:00.000Z"],
    ["Sat, 03 Oct 2026 10:30:00 GMT", "2026-10-03T10:30:00.000Z"],
    ["2026-10-03T17:30:00+07:00", "2026-10-03T10:30:00.000Z"],
    ["2026-10-03T10:30:00Z", "2026-10-03T10:30:00.000Z"],
    // No zone: read as UTC, not in the machine's zone.
    ["Sat, 03 Oct 2026 10:30:00", "2026-10-03T10:30:00.000Z"],
    ["2026-10-03T10:30:00", "2026-10-03T10:30:00.000Z"],
    ["2026-10-03 10:30:00", "2026-10-03T10:30:00.000Z"],
  ])("%s → %s", (input, expected) => {
    expect(parseFeedDate(input).toISOString()).toBe(expected);
  });
});

describe("toArticle", () => {
  test("text is cleaned: CDATA, entities, tags, script and style content", () => {
    const [, html, escaped] = articles("synthetic/rss.xml");
    expect(html!.headline).toBe("HTML & entities: Bank says ’rates’ stay <5%");
    expect(html!.snippet).toBe("First & second paragraph. It’s linked text.");
    expect(escaped!.snippet).toBe("Escaped & decoded once more");
  });

  test("dates are UTC instants; a zone offset is respected", () => {
    const [plain] = articles("synthetic/rss.xml");
    expect(plain!.publishedAt.toISOString()).toBe("2026-10-03T10:30:00.000Z"); // 17:30 +0700
    expect(plain!.publishedAtEstimated).toBe(false);
  });

  test("a missing date uses the fetch time and is flagged; a future date is clamped", () => {
    const [, , , noDate, future] = articles("synthetic/rss.xml");
    expect(noDate).toMatchObject({ publishedAt: fetchedAt, publishedAtEstimated: true });
    expect(future).toMatchObject({ publishedAt: fetchedAt, publishedAtEstimated: false });
  });

  test("a javascript: link, no link or no title means the item is skipped", () => {
    expect(articles("synthetic/rss.xml").slice(5)).toEqual([null, null, null]);
  });

  test("the link is the publisher's original; the canonical URL drops tracking", () => {
    const [first] = articles("synthetic/tracking-duplicates.xml");
    expect(first).toMatchObject({
      link: "https://example.com/story/one?utm_source=rss&utm_medium=feed",
      canonicalUrl: "https://example.com/story/one",
    });
  });

  test("a long multi-byte snippet is cut to 500 characters ending in …", () => {
    const [long] = articles("synthetic/long-snippet.xml");
    expect(Array.from(long!.snippet)).toHaveLength(500);
    expect(long!.snippet.endsWith("…")).toBe(true);
    expect(long!.snippet.isWellFormed()).toBe(true); // no half emoji
  });

  test("an item without a description stores an empty snippet", () => {
    const [, second] = parseFeed(readFixture("synthetic/atom.xml"));
    expect(toArticle(second, feed, 1, fetchedAt)!.snippet).toBe("");
  });
});

describe("recorded feeds (one per source, 2026-10-04)", () => {
  test("there are 12 feeds from 11 publishers", () => {
    expect(FEEDS).toHaveLength(12);
    expect(new Set(FEEDS.map((f) => f.slug)).size).toBe(12);
    expect(new Set(FEEDS.map((f) => f.name.replace(/^BBC .*/, "BBC"))).size).toBe(11);
  });

  test.each(FEEDS)("$slug parses into clean articles", (source) => {
    const headers = JSON.parse(readFixture(`${source.slug}/feed-2026-10-04.headers.json`)).headers;
    const xml = decodeFeed(readFixtureBytes(`${source.slug}/feed-2026-10-04.xml`), headers["content-type"]);
    const stored = parseFeed(xml).map((item) => toArticle(item, source, 1, fetchedAt));

    expect(stored).toHaveLength(3);
    for (const article of stored) {
      expect(article).not.toBeNull();
      expect(article!.headline).not.toBe("");
      expect(article!.headline + article!.snippet).not.toMatch(/<\/?[a-z]|&(#\d+|#x[0-9a-f]+|[a-z]+);/i);
      expect(Array.from(article!.snippet).length).toBeLessThanOrEqual(500);
      expect(article!.canonicalUrl).toMatch(/^https:\/\//);
      expect(article!.publishedAtEstimated).toBe(false);
      expect(article!.publishedAt.getTime()).toBeLessThanOrEqual(fetchedAt.getTime());
    }
  });
});
