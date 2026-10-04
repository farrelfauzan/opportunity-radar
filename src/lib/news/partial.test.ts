import { expect, test } from "vitest";
import { partialState } from "./view";

const source = (slug: string, lastStatus: string | null) => ({ slug, name: slug.toUpperCase(), lastStatus });

test("all sources updated (200 or 304): no partial state", () => {
  expect(partialState([source("a", "200"), source("b", "304"), source("c", "ok")], false)).toBeNull();
});

test("one failed: counted, named, the rest updated", () => {
  const result = partialState([source("a", "200"), source("cnbc", "403"), source("b", "304")], false);
  expect(result).toEqual({ ok: 2, total: 3, failed: [source("cnbc", "403")] });
});

test("every failure kind counts: an HTTP status, a timeout, a network error", () => {
  const result = partialState([source("a", "503"), source("b", "timeout"), source("c", "ENOTFOUND")], false);
  expect(result).toMatchObject({ ok: 0, total: 3 });
  expect(result?.failed).toHaveLength(3);
});

test("while the news is stale only the stale banner speaks", () => {
  expect(partialState([source("a", "200"), source("cnbc", "403")], true)).toBeNull();
});

test("a source with no run on record is not counted as failed", () => {
  expect(partialState([source("a", "200"), source("new", null)], false)).toBeNull();
});
