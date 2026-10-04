import { describe, expect, test } from "vitest";
import { formatNumberInput, parseNumberInput, validateNumberInput } from "./number-input";

describe("parseNumberInput", () => {
  test.each([
    ["10.000.000", 10_000_000],
    ["10000000", 10_000_000],
    ["8,5", 8.5],
    ["1.234,56", 1234.56],
    ["-1", -1],
    ["−2,5", -2.5],
    [" 40 ", 40],
    ["0", 0],
  ])("id reads %s", (text, value) => {
    expect(parseNumberInput(text, "id")).toBe(value);
  });

  test.each([
    ["10,000,000", 10_000_000],
    ["10000000", 10_000_000],
    ["8.5", 8.5],
    ["1,234.56", 1234.56],
    ["-1", -1],
    ["−2.5", -2.5],
  ])("en reads %s", (text, value) => {
    expect(parseNumberInput(text, "en")).toBe(value);
  });

  test.each(["", " ", "abc", "1e5", "8.5", "1.00", "10.000,5,5", "1,,5", "-", ",5", "5,", "1 000"])(
    "id rejects %j",
    (text) => {
      expect(parseNumberInput(text, "id")).toBeNull();
    },
  );

  test.each(["", "abc", "8,5", "1,00", "10.000.000", "1..5", ".5", "5.", "Infinity", "0x10"])(
    "en rejects %j",
    (text) => {
      expect(parseNumberInput(text, "en")).toBeNull();
    },
  );
});

describe("validateNumberInput", () => {
  const years = { min: 1, max: 40, integer: true };

  test("a number in range", () => {
    expect(validateNumberInput("40", "en", years)).toEqual({ value: 40 });
    expect(validateNumberInput("1", "id", years)).toEqual({ value: 1 });
    expect(validateNumberInput("-50", "en", { min: -50, max: 100 })).toEqual({ value: -50 });
    expect(validateNumberInput("10.000.000.000.000", "id", { min: 0, max: 1e13 })).toEqual({ value: 1e13 });
  });

  test("empty or not a number is 'required'", () => {
    expect(validateNumberInput("", "en", years)).toEqual({ error: "required" });
    expect(validateNumberInput("ten", "id", years)).toEqual({ error: "required" });
  });

  test("out of range is 'range'", () => {
    expect(validateNumberInput("-1", "en", years)).toEqual({ error: "range" });
    expect(validateNumberInput("0", "en", years)).toEqual({ error: "range" });
    expect(validateNumberInput("41", "id", years)).toEqual({ error: "range" });
    expect(validateNumberInput("100.5", "en", { min: -50, max: 100 })).toEqual({ error: "range" });
    expect(validateNumberInput("10.000.000.000.001", "id", { min: 0, max: 1e13 })).toEqual({ error: "range" });
  });

  test("a fraction where a whole number is needed is 'range'", () => {
    expect(validateNumberInput("2.5", "en", years)).toEqual({ error: "range" });
    expect(validateNumberInput("2,5", "id", years)).toEqual({ error: "range" });
  });
});

test("formatNumberInput writes the number the way the locale types it", () => {
  expect(formatNumberInput(10_000_000, "id")).toBe("10.000.000");
  expect(formatNumberInput(10_000_000, "en")).toBe("10,000,000");
  expect(formatNumberInput(3.5, "id")).toBe("3,5");
  expect(formatNumberInput(3.5, "en")).toBe("3.5");
  expect(parseNumberInput(formatNumberInput(1e13, "id"), "id")).toBe(1e13);
});
