import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { adviceIn, assertDescriptive, bannedWording } from "./wording.ts";

// The ticket's crafted advice lines (AC1-AC4) and the Reviewer's evasion lines.
const REJECTED = [
  "You should buy gold now, you must act.",
  "Anda harus segera beli emas sekarang.",
  "Investors should buy bank stocks before the rate cut.",
  "A guaranteed winner: demand will rise all year.",
  "Now is a good time to invest in this market.",
  "Analysts recommended buying gold.",
  "Investors are advised to sell.",
  "Consider buying before the cut.",
  "Now is the time to buy the dip.",
  "Prices will surge next month.",
  "A risk-free bet you can't lose.",
  "A risk-free bet you can’t lose.", // curly apostrophe
  "Saham ini layak dibeli.",
  "Saatnya menjual emas.",
  "Gold prices will soar after the decision.",
  "Investors SHOULD BUY now.",
];

// The ticket's legitimate lines: all pass the general list.
const PASSING = [
  "Platforms must verify sellers under the new e-commerce regulation.",
  "Gold closed above its 200-day average for the third week.",
  "Demand for halal-certified cosmetics rose 18% in 2025, according to the cited survey.",
  "Interview five clinic owners about their booking tools.",
  "The rupiah weakened 1.2% against the dollar this week.",
  "Penjual harus mendaftar di OSS sesuai aturan baru.",
  "Harga emas ditutup di atas rata-rata 200 hari.",
  "Wawancarai lima pemilik klinik tentang alat pemesanan mereka.",
  "Rupiah melemah 1,2% terhadap dolar minggu ini.",
  "Platform wajib memverifikasi penjual berdasarkan aturan baru.",
  "Demand is expected to increase once the rule takes effect, according to the ministry.",
  "VAT will increase to 12% from January.",
  "The minimum wage will rise 6.5% next year, the ministry announced.",
  "Import duties on steel will fall to 5% under the new trade deal.",
  "Tarif PPN akan naik menjadi 12% mulai Januari.",
];

describe("general list", () => {
  test.each(REJECTED)("rejects %s", (line) => {
    expect(bannedWording(line)).not.toBeNull();
  });

  test.each(PASSING)("passes %s", (line) => {
    expect(bannedWording(line)).toBeNull();
  });

  test("whole words only: a banned word inside another word is not a hit", () => {
    expect(bannedWording("A recommendation engine for clinics.")).toBeNull();
    expect(bannedWording("Unguaranteed loans grew.")).toBeNull();
    expect(bannedWording("Didisarankannya")).toBeNull();
  });

  test("bare imperatives in first steps and descriptive must/harus/wajib pass", () => {
    for (const line of ["Call three distributors this week.", "Banks must report by March.", "Importir wajib melapor."]) expect(bannedWording(line)).toBeNull();
  });
});

describe("signal list: the general list plus rules-v1 §7.4", () => {
  test.each(["Prices should recover.", "Hindari saham ini.", "Gold will rise.", "Buy in 3 parts over six weeks.", "Platform wajib memverifikasi.", ...REJECTED])(
    "rejects %s",
    (line) => {
      expect(bannedWording(line, "signal")).not.toBeNull();
    },
  );

  test("describing what the rules see passes", () => {
    expect(bannedWording("The close is above the 200-day average and the 50-day average is rising.", "signal")).toBeNull();
  });
});

describe("helpers", () => {
  test("assertDescriptive names the field and the wording", () => {
    expect(() => assertDescriptive({ "lines[0].en": "Fine.", "lines[0].id": "Anda harus beli." })).toThrow(/^lines\[0\]\.id: advice wording "/);
    expect(() => assertDescriptive({ a: "Fine." })).not.toThrow();
  });

  test("adviceIn scans every string of a reply item", () => {
    expect(adviceIn({ id: 1, why: { en: "Fine.", id: "Segera beli sekarang." }, themes: ["ai_adoption"] })).toMatch(/beli/i);
    expect(adviceIn({ id: 1, why: { en: "Fine.", id: "Baik." }, themes: ["ai_adoption"], n: 3 })).toBeNull();
  });
});

test("the phrases live in exactly one file (wording.ts)", () => {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.tsx?$/.test(name) && !name.endsWith(".test.ts")) files.push(path);
    }
  };
  walk(root);
  const holding = files.filter((f) => /"kami sarankan"|"porsi kecil saja"|"buy the dip"/.test(readFileSync(f, "utf8")));
  expect(holding.map((f) => f.slice(root.length))).toEqual(["server/llm/wording.ts"]);
});
