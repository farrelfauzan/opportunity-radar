import { describe, expect, test } from "vitest";
import { newsHref, parseNewsQuery } from "./query";

describe("parseNewsQuery", () => {
  test("no parameters mean All, both regions, first page", () => {
    expect(parseNewsQuery({})).toEqual({ category: undefined, region: undefined, shown: 30 });
  });

  test.each(["business", "politics", "tech-ai", "markets", "commodities"] as const)("category %s", (category) => {
    expect(parseNewsQuery({ category }).category).toBe(category);
  });

  test.each(["indonesia", "global"] as const)("region %s", (region) => {
    expect(parseNewsQuery({ region }).region).toBe(region);
  });

  test("linked is on only for ?linked=1", () => {
    expect(parseNewsQuery({ linked: "1" }).linked).toBe(true);
    expect(parseNewsQuery({ linked: "1", category: "markets", region: "global", shown: "60" })).toEqual({
      category: "markets",
      region: "global",
      linked: true,
      shown: 60,
    });
    // Any other value, or a repeated parameter, is off, and the key is absent.
    for (const linked of ["0", "true", "on", "", "11", " 1", ["1", "1"], undefined]) {
      expect(Object.keys(parseNewsQuery({ linked })), JSON.stringify(linked)).not.toContain("linked");
    }
  });

  test("invalid values fall back to All without an error", () => {
    const query = parseNewsQuery({ category: "xyz", region: "1", shown: "abc" });
    expect(query).toEqual({ category: undefined, region: undefined, shown: 30 });
    // Case matters, a repeated parameter is not a value, and "tech" is the label key, not the URL value.
    expect(parseNewsQuery({ category: "Business" }).category).toBeUndefined();
    expect(parseNewsQuery({ category: "tech" }).category).toBeUndefined();
    expect(parseNewsQuery({ category: ["business", "markets"] }).category).toBeUndefined();
    expect(parseNewsQuery({ region: "" }).region).toBeUndefined();
  });

  test.each([
    ["60", 60],
    ["90", 90],
    ["30", 30],
    ["10", 30],
    ["0", 30],
    ["-60", 30],
    ["1e3", 30],
    ["60.5", 30],
    ["99999", 30],
    ["9999", 3000],
    [undefined, 30],
  ])("shown=%s is %d", (shown, expected) => {
    expect(parseNewsQuery({ shown }).shown).toBe(expected);
  });
});

describe("a day parameter", () => {
  // The page always lists today (WIB): the query has no day, so none can reach listArticles.
  test.each(["2026-10-03", "2026-02-30", "garbage", "", ["2026-10-03", "2026-10-02"]])("%j is ignored", (day) => {
    const query = parseNewsQuery({ day, category: "markets", region: "global", shown: "60" });
    expect(query).toEqual({ category: "markets", region: "global", shown: 60 });
    expect(Object.keys(query).sort()).toEqual(["category", "region", "shown"]);
    expect(newsHref("en", query)).toBe("/en/news?category=markets&region=global&shown=60");
  });
});

describe("newsHref", () => {
  test("leaves out the default values", () => {
    expect(newsHref("en", {})).toBe("/en/news");
    expect(newsHref("id", { shown: 30 })).toBe("/id/news");
  });

  test("linked goes after the region and before the page size; off leaves it out", () => {
    expect(newsHref("en", { linked: true })).toBe("/en/news?linked=1");
    expect(newsHref("id", { category: "markets", region: "global", linked: true, shown: 60 })).toBe(
      "/id/news?category=markets&region=global&linked=1&shown=60",
    );
    expect(newsHref("en", { category: "markets", linked: undefined })).toBe("/en/news?category=markets");
  });

  test("keeps the filters and the page size", () => {
    expect(newsHref("en", { category: "tech-ai", region: "global" })).toBe("/en/news?category=tech-ai&region=global");
    expect(newsHref("id", { category: "markets", shown: 60 })).toBe("/id/news?category=markets&shown=60");
  });
});
