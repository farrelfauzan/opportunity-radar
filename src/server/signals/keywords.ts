// Which news belongs to an asset, for the signal report's news check (OR-33): an article matches
// when its headline contains one of the asset's words (normalised, whole words) or its triage
// themes include one of the asset's themes. Assets added later (OR-44) match by their symbol and name.
import type { Theme } from "@/server/data";
import { normalise } from "@/server/llm/wording";

export const ASSET_NEWS: Record<string, { words: string[]; themes: Theme[] }> = {
  ihsg: { words: ["IHSG", "Jakarta Composite", "indeks harga saham gabungan", "Bursa Efek Indonesia", "BEI", "IDX"], themes: ["ipo_capital_markets"] },
  bbca: { words: ["BBCA", "Bank Central Asia", "BCA"], themes: [] },
  sp500: { words: ["S&P 500", "S&P500", "Wall Street"], themes: [] },
  gold: { words: ["gold", "emas", "XAU", "Antam", "logam mulia"], themes: ["gold_commodities"] },
  silver: { words: ["silver", "perak", "XAG"], themes: [] },
  bitcoin: { words: ["bitcoin", "BTC"], themes: ["crypto_assets"] },
  ethereum: { words: ["ethereum", "ETH", "ether"], themes: ["crypto_assets"] },
};

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A matcher for one asset: its configured words and themes, or its symbol and name. */
export function newsMatcher(asset: { slug: string; symbol: string; name: string }): (article: { headline: string; themes: string[] }) => boolean {
  const config = ASSET_NEWS[asset.slug] ?? { words: [asset.symbol, asset.name], themes: [] };
  const words = config.words.map((w) => normalise(w).trim()).filter(Boolean);
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])(?:${words.map(escape).join("|").replace(/ /g, "\\s+")})(?![\\p{L}\\p{N}])`, "iu");
  return (article) => pattern.test(normalise(article.headline)) || article.themes.some((t) => (config.themes as string[]).includes(t));
}
