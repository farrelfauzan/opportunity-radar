import type { AssetKind } from "@/server/data";

/**
 * The six asset types of the risk cards, in the order they are shown, with their risk level (1 to 5).
 * Their texts are static reviewed content in the dictionaries (inv.classes.items.*, copy.md §7.1).
 */
export const RISK_CLASSES = [
  { key: "cash", risk: 1 },
  { key: "gold", risk: 2 },
  { key: "silver", risk: 3 },
  { key: "idStocks", risk: 4 },
  { key: "globalStocks", risk: 4 },
  { key: "crypto", risk: 5 },
] as const;

export type RiskClassKey = (typeof RISK_CLASSES)[number]["key"];

/**
 * The risk card of a watchlist asset (copy.md names none, so by kind and market): an index or stock listed on
 * the IDX is Indonesian stocks, one listed in the US is Global stocks, gold and silver are their own types
 * (by symbol XAU / XAG), crypto is Crypto. Null for anything else (a currency rate, an unknown market): its
 * row shows no risk.
 */
export function riskClassOf(asset: { kind: AssetKind; symbol: string; exchange: string | null }): RiskClassKey | null {
  switch (asset.kind) {
    case "index":
    case "stock":
      return asset.exchange === "IDX" ? "idStocks" : asset.exchange === "US" ? "globalStocks" : null;
    case "metal":
      return asset.symbol === "XAU" ? "gold" : asset.symbol === "XAG" ? "silver" : null;
    case "crypto":
      return "crypto";
    case "fx":
      return null;
  }
}

/** The risk level (1 to 5) of a risk card. */
export const riskOf = (key: RiskClassKey): number => RISK_CLASSES.find((c) => c.key === key)!.risk;
