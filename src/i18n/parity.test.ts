import { expect, test } from "vitest";
import { readFixture } from "../../tests/fixtures";
import en from "./dictionaries/en.json";
import id from "./dictionaries/id.json";
import { findParityProblems } from "./parity";
import { createT } from "./t";

const fixture = (name: string) => JSON.parse(readFixture(`i18n/${name}.json`));

test("the fixture dictionaries fail on each kind of drift and name the key", () => {
  expect(findParityProblems(fixture("parity-en"), fixture("parity-id"))).toEqual([
    "missing in id: onlyInEn",
    "missing in id: nav.deep.onlyInEnNested",
    "placeholder mismatch: news.count",
    "missing in en: onlyInId",
  ]);
});

test("the real dictionaries are in step", () => {
  expect(findParityProblems(en, id)).toEqual([]);
});

test("t() reads a dotted key and fills placeholders", () => {
  expect(createT(en)("nav.opportunities")).toBe("Opportunities");
  expect(createT(id)("nav.opportunities")).toBe("Peluang");
  expect(createT(id)("time.hoursAgo", { n: 2 })).toBe("2 jam lalu");
});
