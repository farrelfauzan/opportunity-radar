import { describe, expect, test } from "vitest";
import { RISK_CLASSES, riskClassOf, riskOf } from "./risk";

describe("the six risk cards", () => {
  test("come in the order and with the levels of copy.md §7.1", () => {
    expect(RISK_CLASSES.map((c) => [c.key, c.risk])).toEqual([
      ["cash", 1],
      ["gold", 2],
      ["silver", 3],
      ["idStocks", 4],
      ["globalStocks", 4],
      ["crypto", 5],
    ]);
    expect(riskOf("globalStocks")).toBe(4);
  });
});

describe("riskClassOf: the card of a watchlist asset", () => {
  const asset = (kind: Parameters<typeof riskClassOf>[0]["kind"], symbol: string, exchange: string | null) => ({ kind, symbol, exchange });

  test("the v1 watchlist", () => {
    expect(riskClassOf(asset("index", "^JKSE", "IDX"))).toBe("idStocks"); // IHSG
    expect(riskClassOf(asset("stock", "BBCA.JK", "IDX"))).toBe("idStocks");
    expect(riskClassOf(asset("index", "^GSPC", "US"))).toBe("globalStocks"); // S&P 500
    expect(riskClassOf(asset("metal", "XAU", null))).toBe("gold");
    expect(riskClassOf(asset("metal", "XAG", null))).toBe("silver");
    expect(riskClassOf(asset("crypto", "BTCUSDT", null))).toBe("crypto");
    expect(riskClassOf(asset("crypto", "ETHUSDT", null))).toBe("crypto");
  });

  test("an added US stock is global, an Indodax pair is crypto", () => {
    expect(riskClassOf(asset("stock", "AAPL", "US"))).toBe("globalStocks");
    expect(riskClassOf(asset("crypto", "btcidr", "Indodax"))).toBe("crypto");
  });

  test("a rate, an unknown market or an unknown metal has no card", () => {
    expect(riskClassOf(asset("fx", "USD/IDR", null))).toBeNull();
    expect(riskClassOf(asset("stock", "X", "LSE"))).toBeNull();
    expect(riskClassOf(asset("stock", "X", null))).toBeNull();
    expect(riskClassOf(asset("metal", "XPT", null))).toBeNull();
  });
});
