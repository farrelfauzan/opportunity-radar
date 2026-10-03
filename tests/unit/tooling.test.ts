import { expect, test } from "vitest";
import { cn } from "@/lib/utils";
import { readFixture } from "../fixtures";

test("a unit test can import app code through the @/ alias", () => {
  expect(cn("a", false, "b")).toBe("a b");
});

test("a recorded upstream response is read from tests/fixtures", () => {
  expect(readFixture("sample/feed.xml")).toContain("<title>Sample headline</title>");
});

test("a network call from a unit test is refused", async () => {
  const error = await fetch("https://example.com/").catch((e: unknown) => e);
  expect(error).toBeInstanceOf(Error);
  expect(String((error as Error).cause)).toContain("Network access is blocked in unit tests");
});
