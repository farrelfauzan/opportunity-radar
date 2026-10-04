import { describe, expect, test } from "vitest";
import en from "@/i18n/dictionaries/en.json";
import id from "@/i18n/dictionaries/id.json";
import type { MarketRow } from "@/server/data";
import { asOfText, changeView, marketView, priceText, sparklinePoints } from "./view";

const NBSP = "\u00a0";

describe("sparklinePoints", () => {
  test("fewer than 2 closes draw nothing", () => {
    expect(sparklinePoints([])).toBeNull();
    expect(sparklinePoints([5])).toBeNull();
  });

  test("2 points: from the left edge to the right edge, the low one at the bottom", () => {
    expect(sparklinePoints([1, 2])).toBe("0.0,25.0 96.0,3.0");
    expect(sparklinePoints([2, 1])).toBe("0.0,3.0 96.0,25.0");
  });

  test("a flat series is a straight line through the middle", () => {
    expect(sparklinePoints([7, 7, 7])).toBe("0.0,14.0 48.0,14.0 96.0,14.0");
  });

  test("10 points are spread evenly over 96 and scaled to their own range", () => {
    const points = sparklinePoints([5, 6, 5, 7, 8, 7, 9, 10, 9, 11])!.split(" ");
    expect(points).toHaveLength(10);
    expect(points[0]).toBe("0.0,25.0"); // the minimum
    expect(points[1]).toBe("10.7,21.3");
    expect(points[9]).toBe("96.0,3.0"); // the maximum
    expect(points[3].split(",")[0]).toBe("32.0");
  });
});

describe("priceText", () => {
  test("IHSG and USD/IDR are plain grouped whole numbers, with the locale's separator", () => {
    expect(priceText("ihsg", 7412.4, "en")).toBe("7,412");
    expect(priceText("ihsg", 7412.4, "id")).toBe("7.412");
    expect(priceText("usd-idr", 16240.5, "en")).toBe("16,241");
    expect(priceText("usd-idr", 16240, "id")).toBe("16.240");
  });

  test("gold is in rupiah, Bitcoin in whole dollars from $1,000 and with cents below", () => {
    expect(priceText("gold", 1935000, "en")).toBe(`Rp${NBSP}1,935,000`);
    expect(priceText("gold", 1935000, "id")).toBe(`Rp${NBSP}1.935.000`);
    expect(priceText("bitcoin", 98400.4, "en")).toBe("$98,400");
    expect(priceText("bitcoin", 98400.6, "id")).toBe("US$98.401");
    expect(priceText("bitcoin", 999.5, "en")).toBe("$999.50");
  });
});

describe("changeView", () => {
  const strings = { en: en.radar.market, id: id.radar.market };

  test("up: ▲ and the unsigned percent, with a spoken label", () => {
    expect(changeView(101.2, 100, "en", strings.en)).toEqual({ direction: "up", arrow: "▲", text: "1.2%", label: "up 1.2%" });
    expect(changeView(101.2, 100, "id", strings.id)).toEqual({ direction: "up", arrow: "▲", text: "1,2%", label: "naik 1,2%" });
  });

  test("down: ▼ and no minus sign", () => {
    expect(changeView(99.2, 100, "en", strings.en)).toEqual({ direction: "down", arrow: "▼", text: "0.8%", label: "down 0.8%" });
    expect(changeView(99.2, 100, "id", strings.id)).toEqual({ direction: "down", arrow: "▼", text: "0,8%", label: "turun 0,8%" });
  });

  test("unchanged: a dash and 0.0%, never a bare 0%", () => {
    expect(changeView(100, 100, "en", strings.en)).toEqual({ direction: "flat", arrow: "—", text: "0.0%", label: "unchanged" });
    expect(changeView(100, 100, "id", strings.id)).toEqual({ direction: "flat", arrow: "—", text: "0,0%", label: "tidak berubah" });
  });

  test("a change that rounds to zero is unchanged, on either side", () => {
    expect(changeView(100.04, 100, "en", strings.en)?.direction).toBe("flat");
    expect(changeView(99.96, 100, "en", strings.en)).toMatchObject({ direction: "flat", text: "0.0%" });
    expect(changeView(100.06, 100, "en", strings.en)).toMatchObject({ direction: "up", text: "0.1%" });
    expect(changeView(99.94, 100, "id", strings.id)).toMatchObject({ direction: "down", text: "0,1%" });
  });

  test("no previous close, no change", () => {
    expect(changeView(100, null, "en", strings.en)).toBeNull();
  });
});

const row = (over: Partial<MarketRow> = {}): MarketRow => ({
  slug: "bitcoin",
  price: 98400,
  asOf: new Date("2026-10-04T05:00:00Z"),
  timed: true,
  updatedAt: new Date("2026-10-04T05:00:00Z"),
  source: "binance",
  synthetic: false,
  previousClose: 96000,
  closes: [96000, 98400],
  ...over,
});

describe("asOfText", () => {
  const now = new Date("2026-10-04T05:30:00Z"); // 12:30 WIB on 4 Oct

  test("today: the time; an earlier day: the date and time", () => {
    expect(asOfText(row({ asOf: new Date("2026-10-04T05:12:00Z") }), false, now, "en", en)).toBe("As of 12:12 WIB");
    expect(asOfText(row({ asOf: new Date("2026-10-04T05:12:00Z") }), false, now, "id", id)).toBe("Per 12.12 WIB");
    expect(asOfText(row({ asOf: new Date("2026-10-03T05:12:00Z") }), false, now, "en", en)).toBe("As of 3 Oct, 12:12 WIB");
    expect(asOfText(row({ asOf: new Date("2026-10-03T05:12:00Z") }), false, now, "id", id)).toBe("Per 3 Okt, 12.12 WIB");
  });

  test("USD/IDR and a price without a quote show only the date", () => {
    expect(asOfText(row({ slug: "usd-idr", asOf: new Date("2026-10-02T00:00:00Z") }), false, now, "en", en)).toBe("As of 2 Oct");
    expect(asOfText(row({ asOf: new Date("2026-10-02T00:00:00Z"), timed: false }), false, now, "id", id)).toBe("Per 2 Okt");
  });

  test("a closed market shows the closed text with the date of the last close in place of the as-of text", () => {
    expect(asOfText(row({ slug: "ihsg", asOf: new Date("2026-10-02T08:50:00Z") }), true, now, "en", en)).toBe("Market closed · last close 2 Oct");
    expect(asOfText(row({ slug: "ihsg", asOf: new Date("2026-10-02T08:50:00Z") }), true, now, "id", id)).toBe("Pasar tutup · penutupan terakhir 2 Okt");
  });
});

describe("marketView", () => {
  // Tuesday 6 Oct 2026, 12:00 WIB: the IDX and gold are open.
  const now = new Date("2026-10-06T05:00:00Z");
  const ago = (minutes: number) => new Date(now.getTime() - minutes * 60_000);
  const rows = [
    row({ slug: "ihsg", price: 7412, asOf: ago(5), previousClose: 7368, closes: [7300, 7368, 7412] }),
    row({ slug: "usd-idr", price: 16240, asOf: new Date("2026-10-06T00:00:00Z"), previousClose: 16273, closes: [16273] }),
    row({ slug: "gold", price: 1935000, asOf: ago(5), previousClose: 1914000, synthetic: true, closes: [] }),
    row({ slug: "bitcoin", price: 98400, asOf: ago(5), previousClose: 96000, closes: [] }),
  ];
  const fresh = { prices: ago(5), metals: ago(5), crypto: ago(5) };

  test("the sparkline's spoken summary names the first and the last close in this language; none under 2 closes", () => {
    const view = marketView(rows, fresh, now, "en", en);
    expect(view.rows[0].trend).toBe("Last 10 closes: from 7,300 to 7,412");
    expect(marketView(rows, fresh, now, "id", id).rows[0].trend).toBe("10 penutupan terakhir: dari 7.300 ke 7.412");
    expect(view.rows.map((r) => r.trend)).toEqual(["Last 10 closes: from 7,300 to 7,412", null, null, null]); // 1 close, none, none
  });

  test("four rows in order, each with its name, price and change, in this language", () => {
    const view = marketView(rows, fresh, now, "id", id);
    expect(view.rows.map((r) => r.name)).toEqual(["IHSG", "USD/IDR", "Emas / gram", "Bitcoin"]);
    expect(view.rows.map((r) => r.price)).toEqual(["7.412", "16.240", `Rp${NBSP}1.935.000`, "US$98.400"]);
    expect(view.rows.map((r) => r.change?.direction)).toEqual(["up", "down", "up", "up"]);
    expect(view.rows.map((r) => r.synthetic)).toEqual([false, false, true, false]);
    expect(view.rows.map((r) => r.points !== null)).toEqual([true, false, false, false]); // fewer than 2 closes: no sparkline
    expect(view.rows.every((r) => !r.stale)).toBe(true);
    expect(view.staleLine).toBeNull();
  });

  test("a stale row says so, and the line names the OLDEST stale run", () => {
    const view = marketView(rows, { prices: ago(90), metals: ago(70), crypto: ago(5) }, now, "en", en);
    expect(view.rows.map((r) => r.stale)).toEqual([true, false, true, false]);
    expect(view.staleLine).toBe("Prices last updated 10:30 WIB"); // the prices run, 90 minutes ago
    const earlier = marketView(rows, { ...fresh, metals: new Date("2026-10-04T01:00:00Z") }, now, "en", en);
    expect(earlier.staleLine).toBe("Prices last updated 4 Oct, 08:00 WIB");
  });

  test("a job that never ran falls back to when the store wrote the price", () => {
    const view = marketView(
      [row({ updatedAt: ago(120) }), row({ slug: "gold", updatedAt: ago(10) })],
      { prices: null, metals: null, crypto: null },
      now,
      "en",
      en,
    );
    expect(view.rows.map((r) => r.stale)).toEqual([true, false]);
    expect(view.staleLine).toBe("Prices last updated 10:00 WIB");
  });

  test("outside its hours the IDX shows the closed text and is not stale", () => {
    const night = new Date("2026-10-06T13:00:00Z"); // 20:00 WIB
    const view = marketView([rows[0]], { prices: new Date("2026-10-06T09:00:00Z") }, night, "en", en);
    expect(view.rows[0]).toMatchObject({ stale: false, asOf: expect.stringContaining("Market closed · last close") });
    expect(view.staleLine).toBeNull();
  });
});
