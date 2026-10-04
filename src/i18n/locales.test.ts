import { expect, test } from "vitest";
import { canonicalLocalePath } from "./locales";

test("a supported locale in the wrong case maps to the lowercase path, keeping the rest", () => {
  expect(canonicalLocalePath("/EN")).toBe("/en");
  expect(canonicalLocalePath("/Id")).toBe("/id");
  expect(canonicalLocalePath("/iD")).toBe("/id");
  expect(canonicalLocalePath("/EN/news")).toBe("/en/news");
  expect(canonicalLocalePath("/EN/")).toBe("/en/");
  expect(canonicalLocalePath("/ID/invest/gold")).toBe("/id/invest/gold");
    expect(canonicalLocalePath("/EN/Mixed/Case")).toBe("/en/Mixed/Case");
});

test("a percent-encoded locale is decoded before it is compared", () => {
  expect(canonicalLocalePath("/%45N")).toBe("/en");
  expect(canonicalLocalePath("/%45n/news")).toBe("/en/news");
  expect(canonicalLocalePath("/%65n")).toBe("/en");
  expect(canonicalLocalePath("/%49d/invest/gold")).toBe("/id/invest/gold");
  // Decoded once only, like Next.js does: "%2545N" is the text "%45N", not a locale.
  expect(canonicalLocalePath("/%2545N")).toBeNull();
  expect(canonicalLocalePath("/%E0%A4%A")).toBeNull(); // malformed encoding
});


test("anything else needs no change", () => {
  for (const path of ["/", "/en", "/id", "/en/news", "/FR", "/Fr/news", "/ENG", "/e", "/en2", "/news/EN", ""]) {
    expect(canonicalLocalePath(path), path).toBeNull();
  }
});
