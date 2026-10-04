import { describe, expect, test } from "vitest";
import { opportunitiesHref, parseOpportunityId, parseOpportunityQuery } from "./query";

describe("parseOpportunityQuery", () => {
  test("no parameters mean All on every filter", () => {
    expect(parseOpportunityQuery({})).toEqual({
      region: undefined,
      sector: undefined,
      horizon: undefined,
      capital: undefined,
    });
  });

  test("known values are kept", () => {
    expect(parseOpportunityQuery({ region: "indonesia", sector: "logistics", horizon: "6-12m", capital: "low" })).toEqual({
      region: "indonesia",
      sector: "logistics",
      horizon: "6-12m",
      capital: "low",
    });
    expect(parseOpportunityQuery({ region: "global" }).region).toBe("global");
    expect(parseOpportunityQuery({ horizon: "0-6m" }).horizon).toBe("0-6m");
    expect(parseOpportunityQuery({ horizon: "1-3y" }).horizon).toBe("1-3y");
    expect(parseOpportunityQuery({ capital: "high" }).capital).toBe("high");
  });

  test("invalid values fall back to All without an error", () => {
    expect(
      parseOpportunityQuery({ region: "mars", sector: "tech", horizon: "forever", capital: "huge" }),
    ).toEqual({ region: undefined, sector: undefined, horizon: undefined, capital: undefined });
    // Case matters, a label is not a value, a repeated parameter is not a value, empty is All.
    expect(parseOpportunityQuery({ region: "Indonesia" }).region).toBeUndefined();
    expect(parseOpportunityQuery({ sector: "Logistics & Supply Chain" }).sector).toBeUndefined();
    expect(parseOpportunityQuery({ sector: ["logistics", "agri_food"] }).sector).toBeUndefined();
    expect(parseOpportunityQuery({ capital: "" }).capital).toBeUndefined();
    // "worldwide" is the LLM contract's word; the stored and URL value is "global".
    expect(parseOpportunityQuery({ region: "worldwide" }).region).toBeUndefined();
  });

  test("a valid filter beside an invalid one is kept", () => {
    expect(parseOpportunityQuery({ region: "indonesia", capital: "x" })).toMatchObject({ region: "indonesia", capital: undefined });
  });
});

describe("opportunitiesHref", () => {
  test("leaves defaults out and keeps the filters in a fixed order", () => {
    expect(opportunitiesHref("en", {})).toBe("/en/opportunities");
    expect(opportunitiesHref("id", { sector: "logistics", region: "indonesia" })).toBe(
      "/id/opportunities?region=indonesia&sector=logistics",
    );
  });

  test("a detail link keeps the filters", () => {
    expect(opportunitiesHref("en", { capital: "low" }, 7)).toBe("/en/opportunities/7?capital=low");
    expect(opportunitiesHref("en", {}, 7)).toBe("/en/opportunities/7");
  });
});

describe("parseOpportunityId", () => {
  test("accepts a positive whole number", () => {
    expect(parseOpportunityId("1")).toBe(1);
    expect(parseOpportunityId("123456789")).toBe(123456789);
  });

  test.each(["0", "-1", "01", "1.5", "abc", "1e3", "", " 1", "1234567890", "99999999999999999999"])("rejects %j", (value) => {
    expect(parseOpportunityId(value)).toBeNull();
  });
});
