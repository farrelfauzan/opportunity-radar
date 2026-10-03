import { readFileSync } from "node:fs";

/** Reads a recorded upstream response from tests/fixtures, e.g. readFixture("sample/feed.xml"). */
export function readFixture(path: string): string {
  return readFileSync(new URL(`./fixtures/${path}`, import.meta.url), "utf8");
}
