import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";

// Screens read signals only through `signalViews` / `signalHistoryView` (src/server/data/signals.ts), which turn a
// synthetic series into the no-verdict state (copy.md §8.2). A raw read from the page code would show a made-up
// verdict as real, so nothing under src/app, src/components or src/lib may name the raw access. The job code under
// src/server is where the raw rows belong.

const ROOT = join(import.meta.dirname, "../..");
const FOLDERS = ["src/app", "src/components", "src/lib"];

// Whole identifiers: `signalHistoryView` (the allowed view) must not match `signalHistory` (the table).
const FORBIDDEN: [string, RegExp][] = [
  ["getSignal", /\bgetSignal\b/],
  ["listSignalHistory", /\blistSignalHistory\b/],
  ["saveSignal", /\bsaveSignal\b/],
  ["closesForSignals", /\bclosesForSignals\b/],
  ["toView (a raw signal row)", /\btoView\b/],
  ["signalHistory (the table)", /\bsignalHistory\b/],
  // The tables, imported from the schema (even through a relative path or an alias).
  ["signals table from the schema", /import[^;]*\bsignals\b[^;]*from\s+["'][^"']*schema(\.ts)?["']/],
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

/** The files and identifiers that break the rule, as "file: identifier". */
function rawSignalAccess(files: { path: string; text: string }[]): string[] {
  return files.flatMap(({ path, text }) => FORBIDDEN.filter(([, pattern]) => pattern.test(text)).map(([name]) => `${path}: ${name}`));
}

test("no page or library code reads signals except through signalViews", () => {
  const files = FOLDERS.flatMap((folder) => sourceFiles(join(ROOT, folder))).map((path) => ({ path: path.slice(ROOT.length + 1), text: readFileSync(path, "utf8") }));
  expect(files.length).toBeGreaterThan(20); // the scan really found the sources
  expect(rawSignalAccess(files)).toEqual([]);
});

test("the scan catches each raw access, and lets the views through", () => {
  const bad = (text: string) => rawSignalAccess([{ path: "x.ts", text }]);
  expect(bad('import { getSignal } from "@/server/data";')).toHaveLength(1);
  expect(bad("const rows = await listSignalHistory(1);")).toHaveLength(1);
  expect(bad("await saveSignal(signal, null);")).toHaveLength(1);
  expect(bad('import { toView } from "@/server/data/signals";')).toHaveLength(1);
  expect(bad('import { signals } from "@/server/data/schema.ts";')).toHaveLength(1);
  expect(bad('import { signalHistory, assets } from "../../server/data/schema";')).toHaveLength(1);
  expect(bad('import { signalViews, signalHistoryView } from "@/server/data";')).toEqual([]);
  expect(bad('import { assets, signals as table } from "./other";')).toEqual([]);
});
