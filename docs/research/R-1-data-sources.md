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

## Addendum 2026-10-04 (R-2): RSS feed URLs for OR-8, and terms read since
All 12 returned HTTP 200 with a valid feed on 2026-10-04 [L], from a residential Indonesian IP (retest from the deployed environment in OR-5). Send a browser-like User-Agent. Items = entries in the feed that day.
| # | Feed | Region | Lang | URL | Default category | Items |
|---|---|---|---|---|---|---|
| 1 | CNBC Indonesia | ID | id | https://www.cnbcindonesia.com/news/rss | business | 100 |
| 2 | Antara Bisnis | ID | id | https://www.antaranews.com/rss/ekonomi-bisnis.xml | business | 20 |
| 3 | CNN Indonesia Ekonomi | ID | id | https://www.cnnindonesia.com/ekonomi/rss | business | 100 |
| 4 | Katadata | ID | id | https://katadata.co.id/rss | business | 25 |
| 5 | IDX Channel | ID | id | https://www.idxchannel.com/rss | markets | 10 |
| 6 | Republika Ekonomi | ID | id | https://www.republika.co.id/rss/ekonomi | business | 15 |
| 7 | BBC Business | Worldwide | en | https://feeds.bbci.co.uk/news/business/rss.xml | business | 55 |
| 8 | BBC Technology | Worldwide | en | https://feeds.bbci.co.uk/news/technology/rss.xml | tech | 21 |
| 9 | TechCrunch AI | Worldwide | en | https://techcrunch.com/category/artificial-intelligence/feed/ | tech / AI | 20 |
| 10 | The Guardian Business | Worldwide | en | https://www.theguardian.com/uk/business/rss | business | 36 |
| 11 | CNBC Business | Worldwide | en | https://www.cnbc.com/id/10001147/device/rss/rss.html | business | not counted |
| 12 | Hacker News | Worldwide | en | https://news.ycombinator.com/rss | tech | 30 |

Optional (also live-tested OK): Antara terkini https://www.antaranews.com/rss/terkini.xml (50, general), Al Jazeera https://www.aljazeera.com/xml/rss/all.xml (25), CNBC US Top News https://www.cnbc.com/id/100003114/device/rss/rss.html (30), Straits Times business https://www.straitstimes.com/news/business/rss.xml (27), SCMP business https://www.scmp.com/rss/92/feed (50), Tech in Asia https://www.techinasia.com/feed (36).
Do not use: Tempo bisnis `https://rss.tempo.co/bisnis` (last item 2026-09-14, stale); Kompas money and Liputan6 bisnis URLs tried (404); DealStreetAsia (503); `hnrss.org` (no connection; use the official HN URL).
Conditional GET: only Antara, CNBC Indonesia, CNN Indonesia, TechCrunch, Guardian and CNBC returned ETag or Last-Modified headers [L]. The others did not, so dedupe by URL is required.

Terms read since R-1: gold-api.com permits commercial use, needs no attribution, bans IPs for multiple requests per second, and has no history without a key (R-2 §3). Yahoo's terms prohibit automated collection and commercial reuse (R-2 §3).

## Addendum 2026-10-04 (R-3 request from Engineer-2): replacement for Hacker News
Hacker News `https://news.ycombinator.com/rss` answers HTTP 419 to Node's `fetch` with the project User-Agent while curl gets 200 [L, reproduced: Node v25.6.1, same UA, 419]. Dropped; no workaround attempted.
Candidates tested with Node `fetch` and `Mozilla/5.0 (compatible; OpportunityRadar/0.1; +https://github.com/farrelfauzan/opportunity-radar)`, 2026-10-04, residential Indonesian IP [L]:
| Feed | URL | Node status | Items | Items with empty description | Median description length | ETag / Last-Modified |
|---|---|---|---|---|---|---|
| **Wired (recommended)** | https://www.wired.com/feed/rss | 200 (5 repeats 200, with and without Accept header) | 50 | 0 | 143 chars | none |
| Tech in Asia | https://www.techinasia.com/feed | 200 (5 repeats 200) | 36 | 0 | 94 | both |
| The Verge | https://www.theverge.com/rss/index.xml | 200 | 10 | 0 | 310 | ETag |
| Ars Technica | https://feeds.arstechnica.com/arstechnica/index | 200 | 20 | 0 | 79 | Last-Modified |
| The Register | https://www.theregister.com/headlines.atom | 200 | 50 | 0 | 90 | none |
| Engadget | https://www.engadget.com/rss.xml | 200 | 20 | 0 | 124 | both |
| TechCrunch main | https://techcrunch.com/feed/ | 200 | 20 | not measured | not measured | both |
| MIT Technology Review | https://www.technologyreview.com/feed/ | 200 | 10 | not measured | not measured | both |
| Rest of World | https://restofworld.org/feed/ | 200 | 12 | not measured | not measured | Last-Modified |
| VentureBeat | https://venturebeat.com/feed/ | **429** | 0 | — | — | — |
Recommended for OR-8: **Wired**, region Worldwide, language en, default category tech. Reasons: 50 items, every item has a real one-or-two-sentence description, frequent AI and business coverage, stable 200. Drawback: no ETag or Last-Modified, so dedupe by URL is required (as for six other feeds). Fallback if a second one is wanted: The Verge (richest descriptions, only 10 items, ETag). Tech in Asia (Region: Asia, Lang: en, category tech/startups) fits the Indonesia focus and supports conditional GET, but it is not global. Not read: any publisher's terms of use for RSS (headline, snippet and link only is inference). Not tested from a hosting IP.
