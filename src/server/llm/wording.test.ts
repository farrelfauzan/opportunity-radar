import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { adviceIn, assertDescriptive, bannedWording, normalise, WORDING_RULE, wordingHit } from "./wording.ts";

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
  // Forecasts with no policy noun before "will" / "akan" (inverted rule).
  "The rupiah will fall.",
  "The IHSG will drop.",
  "Yields will rise.",
  "Oil will surge.",
  "The dollar will weaken.",
  "BBCA will rally.",
  "The market will likely climb.",
  "Demand will rise all year.",
  "Clinic visits will increase.",
  "Rupiah akan melemah.",
  "IHSG akan anjlok.",
  "Permintaan akan terus meningkat.",
  // Same clause, more "will" forms, attribution (PR 65 refinements).
  "The VAT rise means demand will fall.",
  "Kenaikan PPN berarti permintaan akan turun.",
  "Gold is set to climb.",
  "Demand is going to rise.",
  "Prices are likely to surge.",
  "Harga bakal naik.",
  "Demand is expected to increase.",
  "Permintaan diperkirakan akan meningkat.",
  // Extra: a policy noun after a comma does not excuse; "bound to"; "diprediksi".
  "Under the new tax, demand will fall.",
  "Prices are bound to rebound.",
  "Penjualan diprediksi naik.",
  // An attribution excuses only the "expected to" form, not a plain "will" / "akan" (Orchestrator, PR 68).
  "The minister said gold will surge.",
  "Menteri mengatakan emas akan naik.",
  "Menurut analis, harga emas akan melonjak.",
  // The policy noun must be within the four words before "will".
  "The VAT on imported household electronic goods will rise.",
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
  // Policy noun before "will" / "akan", in the same clause.
  "The import quota will fall to 1 million tonnes.",
  "Cukai rokok akan naik 10% tahun depan.",
  "Upah minimum akan naik 6,5% tahun depan.",
  // An expectation attributed in the same sentence.
  "Permintaan diperkirakan akan meningkat, menurut Kementerian Perdagangan.",
  "Exports are forecast to grow 4%, the central bank said.",
  "Sales are projected to rise 3%, BPS reported. Margins stayed flat.",
  "Gold is expected to surge, according to the minister.",
  "Emas diperkirakan naik, menurut menteri.",
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

  test("the attribution must be in the same sentence as the expectation", () => {
    expect(bannedWording("Demand is expected to increase. The ministry said so last week.")).toBe("is expected to increase");
    expect(bannedWording("The ministry said so. Permintaan diperkirakan naik.")).toBe("diperkirakan naik");
  });

  test("bare imperatives in first steps and descriptive must/harus/wajib pass", () => {
    for (const line of ["Call three distributors this week.", "Banks must report by March.", "Importir wajib melapor."]) expect(bannedWording(line)).toBeNull();
  });
});

describe("signal list: the general list plus rules-v1 §7.4", () => {
  test.each(["Prices should recover.", "Hindari saham ini.", "Gold will rise.", "VAT will increase to 12%.", "Exports are forecast to grow 4%, the bank said.", "Buy in 3 parts over six weeks.", "Platform wajib memverifikasi.", ...REJECTED])(
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
  test("assertDescriptive names the field and the wording, as an AdviceError", async () => {
    const { AdviceError } = await import("./wording.ts");
    expect(() => assertDescriptive({ x: "Demand will rise." })).toThrow(AdviceError);
    expect(() => assertDescriptive({ "lines[0].en": "Fine.", "lines[0].id": "Anda harus beli." })).toThrow(/^lines\[0\]\.id: advice wording \(rule "/);
    expect(() => assertDescriptive({ a: "Fine." })).not.toThrow();
  });

  test("adviceIn scans every string of a reply item", () => {
    expect(adviceIn({ id: 1, why: { en: "Fine.", id: "Segera beli sekarang." }, themes: ["ai_adoption"] })?.match).toMatch(/beli/i);
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

describe("OR-64: normalisation, clause breaks, forecast forms, the authority exception", () => {
  test.each([
    // Clause breaks: a sentence end, colon or dash ends the policy noun's clause.
    "The VAT rose. Demand will fall.",
    "VAT: demand will fall.",
    "VAT — demand will fall.",
    "VAT (demand will fall).",
    "The VAT rose\nDemand will fall.",
    // Forecast forms with filler words; would / shall / gonna count as will.
    "Gold will also rise.",
    "Prices will soon surge.",
    "Gold will go up.",
    "Gold will hit record highs.",
    "Prices will be higher next year.",
    "Gold would surge.",
    "Gold would rise if rates fell.", // accepted cost: write "could rise"
    "Gold shall rise.",
    "Gold is gonna rise.",
    "Harga emas akan kembali naik.",
    "Saham akan melambung.",
    "Rupiah akan terapresiasi.",
    // Normalisation.
    "Set a stop-loss.",
    "**take-profit** at 10%",
    "ｂｕｙ ｎｏｗ",
    "you  **should**  buy",
    "buy<b></b> now",
    "buy\u200b now",
    "risk\u00ad free returns",
    "risk_free returns",
    // Mandates without an authority word in reach, or with one that is only attributed.
    "You must invest in gold.",
    "Investors must sell bank stocks.",
    "Investors must buy gold, the ministry says.",
    "Investors must buy gold, OJK data show.",
    "Investor harus membeli emas, data OJK menunjukkan.",
    "Investors must buy gold, according to the ministry.",
    "Investors must sell now, the regulator warned.",
    // "recommend" in any inflection, also inside names (accepted).
    "Recommended Daily Allowance rises.",
  ])("rejects %s", (line) => {
    expect(bannedWording(line)).not.toBeNull();
  });

  test.each([
    "Prices could fall if the subsidy ends.",
    "Prices may rise if demand holds.",
    "Costs might increase, the survey found.",
    "VAT will also increase to 12% from January.",
    "Pension funds must invest 30% in bonds under the new rule.",
    "Under the new regulation, funds must invest 30% in bonds.",
    "Dana pensiun wajib berinvestasi 30% di obligasi sesuai aturan OJK.",
    "Bank harus membeli SBN sesuai aturan OJK.",
    "The new rule requires funds to invest 30% in bonds.",
    // Decimals and abbreviations are not sentence ends: the clause and sentence hold.
    "The VAT of 12.5% will increase to 13% in 2026.",
    "Rp 1.000.000 duty: the U.S. tariff will rise to 25%.",
    "Exports are expected to grow 4.5%, the No. 2 ministry said.",
  ])("passes %s", (line) => {
    expect(bannedWording(line)).toBeNull();
  });

  test("the signal list rejects every mandate, authority or not", () => {
    expect(bannedWording("Pension funds must invest 30% in bonds under the new rule.", "signal")).not.toBeNull();
  });

  test("normalise: NFKC, hidden characters, tags, markdown, hyphens and spaces; line breaks kept", () => {
    expect(normalise("ｂｕｙ\u200b  <i>now</i>")).toBe("buy now ");
    expect(normalise("stop-loss_order\u00ad")).toBe("stop loss order");
    expect(normalise("a\n b")).toBe("a\n b");
  });

  test("a hit names the list entry (logged and counted), never more of the text", () => {
    expect(wordingHit("Set a stop-loss.")).toEqual({ id: "stop loss", match: "stop loss" });
    expect(wordingHit("Demand will rise.")).toEqual({ id: "forecast", match: "will rise" });
    expect(wordingHit("Investors must sell bank stocks.")).toMatchObject({ id: "mandate" });
  });

  test("WORDING_RULE, the prompt sentence, passes its own guard", () => {
    expect(bannedWording(WORDING_RULE)).toBeNull();
  });

  test("long texts stay fast: the policy check looks only just before each forecast", () => {
    const text = "the tax will rise ".repeat(6000); // about 100,000 characters
    const started = performance.now();
    expect(bannedWording(text)).toBeNull();
    expect(performance.now() - started).toBeLessThan(1000);
  });
});

describe("OR-65: suggest, certainty, ratings, sentence-initial imperatives", () => {
  test.each([
    "Kami merekomendasikan saham BBCA.",
    "Saham ini direkomendasikan.",
    "Kami menyarankan membeli emas.",
    "Analis menyarankan untuk menjual saham.",
    "Lebih baik beli emas sekarang.",
    "We suggest buying gold.",
    "I suggest selling now.",
    "Analysts suggested investing early.",
    "Gold is sure to rise.",
    "Silver is certain to fall.",
    "We guarantee returns.",
    "A guaranteed winner.",
    "A surefire way to profit.",
    "You can't go wrong with gold.",
    "It's a no-brainer.",
    "Harga emas pasti akan naik.",
    "Tidak mungkin rugi.",
    "Pasti untung.",
    "Strong buy rating on BBCA.",
    "BBCA was rated a sell.",
    "Peringkat beli untuk BBCA.",
    "Rekomendasi beli untuk emas.",
    "Buy gold today.",
    "Belilah emas hari ini.",
    "Demand is rising. Sell your stocks.",
    "Hold the shares until March.",
    "Invest in gold.",
    "Jual saham sekarang.",
  ])("rejects %s", (line) => {
    expect(bannedWording(line)).not.toBeNull();
  });

  test.each([
    "The data suggest demand is rising.",
    "Kementerian menyarankan agar platform memverifikasi penjual.",
    "Make sure to register on OSS first.",
    "Be sure to compare three suppliers.",
    "Sellers hold most of the stock in Java.", // "hold" mid-sentence describes
    "Clinic owners buy software once a year.",
  ])("passes %s", (line) => {
    expect(bannedWording(line)).toBeNull();
  });

  test("opportunity first steps may start with an imperative; the same line elsewhere is rejected", () => {
    for (const step of ["Buy a small batch of stock to test demand.", "Interview five clinic owners this week.", "Wawancarai lima pemilik klinik minggu ini."]) {
      expect(wordingHit(step, "general", { firstStep: true })).toBeNull();
    }
    expect(wordingHit("Buy a small batch of stock to test demand.")).toMatchObject({ id: "imperative" });
    // Other advice is still rejected in a first step.
    expect(wordingHit("We suggest buying gold.", "general", { firstStep: true })).not.toBeNull();
  });

  test("the first-reply scan treats a firstSteps key as first steps", () => {
    const item = { thesis: { en: "Fine.", id: "Baik." }, firstSteps: { en: ["Buy a small batch of stock to test demand."], id: ["Beli sedikit stok."] } };
    expect(adviceIn(item)).toBeNull();
    expect(adviceIn({ ...item, thesis: { en: "Buy a small batch of stock.", id: "Baik." } })).toMatchObject({ id: "imperative" });
  });

  test("static copy is never checked: only the AI jobs and the LLM module use the guard", () => {
    const root = fileURLToPath(new URL("../../", import.meta.url));
    const users: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.tsx?$/.test(name) && !name.endsWith(".test.ts") && /llm\/wording/.test(readFileSync(path, "utf8"))) users.push(path.slice(root.length));
      }
    };
    walk(root);
    expect(users.sort()).toEqual([
      "server/news/triage.ts",
      "server/opportunities/brief.ts",
      "server/opportunities/contract.ts",
      "server/opportunities/generate.ts",
      "server/opportunities/score.ts",
      "server/ventures/market.ts",
    ]);
  });
});
