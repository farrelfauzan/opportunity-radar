# R-1 — Which data sources should the app use?

Checked 2026-10-03. Evidence key: **[L]** endpoint called live that day · **[P]** read on the vendor's page · **[S]** third-party snippet only (unverified) · **[I]** inference.
All [L] calls were made from a residential Indonesian IP. Datacentre IPs (e.g. Vercel) may be blocked or throttled by Yahoo, Cloudflare-protected sites and Binance: **retest from the deployed environment in sprint 1.**

## Short answer
Build news on RSS; prices on Yahoo's chart endpoint (stocks), gold-api.com (metals), Binance + Indodax (crypto), Frankfurter (USD/IDR). All keyless. Persist candles in our own store. Page views read the store, never upstream.

| Need | Primary | Fallback | Key | Limit / delay | Main risk | Confidence |
|---|---|---|---|---|---|---|
| Indonesian news | RSS: CNBC Indonesia, Antara, CNN Indonesia ekonomi, Katadata, IDX Channel, Republika ekonomi [L] | Tempo `rss.tempo.co/bisnis` (stale) [L] | No | none stated / minutes | Headline, snippet and link only; feeds can change | High |
| Global news | RSS: BBC business + tech, TechCrunch AI, Guardian business, CNBC, Hacker News [L] | NYT, FT RSS (limited) | No | none / minutes | Licence, not tech | High |
| News aggregator (optional) | Marketaux: 100 req/day, 3 articles/req [P] | NewsData.io [S], GDELT (429 seen) [L] | Yes | see left | Thin free tiers | Med–low |
| IDX stocks, IHSG | Yahoo chart endpoint (BBCA.JK, ^JKSE, 10y daily OK) [L] | GoAPI.io (unverified), EODHD paid | No | unofficial / ~10 min [I] | Unofficial, personal-use terms [I]; `v7/quote` needs a crumb (401) [L] | Med |
| US/global stocks | Yahoo chart (AAPL OK) [L] | Finnhub [S], Twelve Data 800 credits/day [P] | Fallbacks yes | ~15 min [I] | Same as above | Med |
| Gold / silver spot USD | gold-api.com [L] | Yahoo GC=F / SI=F (futures) [L] | No | "no rate limiting" [P] / seconds | Small vendor, terms not read | Med |
| Gold IDR per gram | XAU_USD ÷ 31.1035 × USD/IDR | — | No | — | Antam retail carries a premium over spot | Med |
| Antam / Pegadaian retail | None usable (Cloudflare 403) [L] | Manual entry | — | — | No official API | High |
| Crypto | Binance `data-api.binance.vision` + Indodax (IDR pairs, OHLC) [L] | CoinGecko demo: 10k credits/month, attribution [P] | No | real time | `api.binance.com` failed; use the vision host | High |
| USD/IDR | Frankfurter `api.frankfurter.dev/v1` [L] | open.er-api.com (attribution) | No | daily (ECB) | `exchangerate.host` now needs a key | High |
| Macro | World Bank API [L] | BPS WebAPI (key, unverified); BI-Rate is an HTML page only [P] | Mixed | annual/monthly | BI rate needs manual entry or a scraper | Med |
| LLM | Claude Haiku 4.5 (triage) | Claude Sonnet 5.5 (reports) | Yes | — | Cost, see below | High |

Rejected: NewsAPI.org (free plan barred from production, 24 h delay) [P]; GNews (free is non-commercial, 12 h delay) [P]; Sectors.app (paid) [P]; Twelve Data for IDX (not on free) [P]; Stooq (JS challenge) [L]; exchangerate.host (key) [L].
Blocked or missing when tested: Bisnis.com (403), Kontan news feeds (403), Tempo www (403), Jakarta Post, Reuters, detik (404) [L].
Not researched: Indonesian mutual funds and bonds (no free API found; plan manual NAV entry).
Unverified: Finnhub free limits, Yahoo delay and terms wording, Indodax/Binance rate limits, gold-api.com terms, Marketaux/GoAPI/BPS terms.

## Refresh intervals
- RSS: every 15–30 min, ETag / If-Modified-Since, dedupe by URL; store link, headline, snippet, timestamp.
- IDX quotes: every 10 min, 09:00–16:00 WIB Mon–Fri; daily candles once after the close (~17:00 WIB).
- US quotes: 15 min in US hours; daily candles once a day.
- Gold/silver: 5–10 min. Crypto: 1–15 min. USD/IDR: cache ~6 h. Macro: weekly.

## LLM cost (researcher's arithmetic from the pricing page, not measured)
Daily digest of ~100 headlines + ~20 signal reports ≈ 40k input / 15k output tokens: Haiku 4.5 ≈ $3.5/month, Sonnet 5.5 ≈ $7/month, Opus 5.5 ≈ $14/month. Batch API halves it.

## Sources
twelvedata.com/pricing · alphavantage.co/premium · coingecko.com/en/api/pricing · gnews.io/pricing · newsapi.org/pricing · marketaux.com/pricing · eodhd.com/pricing · docs.sectors.app · gold-api.com · frankfurter.dev · gdeltproject.org/data.html · bi.go.id BI-Rate page · platform.claude.com/docs/en/about-claude/pricing
