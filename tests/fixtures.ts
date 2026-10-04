import { readFileSync } from "node:fs";

/** Reads a recorded upstream response from tests/fixtures, e.g. readFixture("sample/feed.xml"). */
export function readFixture(path: string): string {
  return readFileSync(new URL(`./fixtures/${path}`, import.meta.url), "utf8");
}

/** The same file as raw bytes, for feeds that are not UTF-8. */
export function readFixtureBytes(path: string): ArrayBuffer {
  const bytes = readFileSync(new URL(`./fixtures/${path}`, import.meta.url));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
