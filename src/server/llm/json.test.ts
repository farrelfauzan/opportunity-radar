import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { InvalidOutputError, parseModelJson } from "./json";

const contract = JSON.parse(
  readFileSync(new URL("../../../docs/opportunities/contract-examples.json", import.meta.url), "utf8"),
) as { rawResponses: { name: string; raw: string; expect: string }[] };

describe("parseModelJson (scoring-v1 §5 fence rule)", () => {
  test.each(contract.rawResponses)("$name: $expect", ({ raw, expect: expected }) => {
    if (expected.startsWith("accept")) expect(parseModelJson(raw)).toEqual({ ok: true });
    else expect(() => parseModelJson(raw)).toThrow(InvalidOutputError);
  });

  test("plain JSON is accepted as is", () => {
    expect(parseModelJson(' {"a":[1,2]} ')).toEqual({ a: [1, 2] });
  });

  test("a fence without the json tag is not stripped", () => {
    expect(() => parseModelJson('```\n{"ok":true}\n```')).toThrow(InvalidOutputError);
  });
});
