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
**Superseded by the terms review below: Wired's publisher terms restrict storing and AI use.** Recommended for OR-8 at the time: **Wired**, region Worldwide, language en, default category tech. Reasons: 50 items, every item has a real one-or-two-sentence description, frequent AI and business coverage, stable 200. Drawback: no ETag or Last-Modified, so dedupe by URL is required (as for six other feeds). Fallback if a second one is wanted: The Verge (richest descriptions, only 10 items, ETag). Tech in Asia (Region: Asia, Lang: en, category tech/startups) fits the Indonesia focus and supports conditional GET, but it is not global. Not read: any publisher's terms of use for RSS (headline, snippet and link only is inference). Not tested from a hosting IP.

## Addendum 2026-10-04 (R-4, Orchestrator request): publisher terms for every feed, and what the app may do with them
Question: for each feed in the OR-8 list, do the publisher's own terms allow a personal, single-user app that stores headline, snippet and link and sends them to an LLM for triage? Method: each terms page was downloaded with curl on 2026-10-04 (WebFetch is blocked for some of these domains); quotes below are exact. The short Indonesian disclaimers, the Antara RSS page, the BBC pages, the TechCrunch RSS terms and the Guardian feeds page were read in full. For the long documents (Condé Nast user agreement, TechCrunch terms of service, Guardian terms, Versant/CNBC terms, The Conversation terms, Fed and World Bank terms) I searched for keywords (automated, scrape, robot, crawl, spider, RSS, feed, AI, artificial, machine learning, text and data, mining, cache, store, aggregate, reproduce, commercial, personal) and read the matching clauses, not every clause, so a restriction worded differently could be missed. I am not a lawyer; "verdict" is my reading of the wording, not legal advice. Verdicts: **Not allowed** = a clause covers this use; **Unclear, restrictive** = personal or non-commercial use only, with no clause on storing or AI; **Unclear, silent** = only a copyright notice or a general disclaimer, nothing on RSS, automation, storing or AI.

| Publisher (feeds) | Page(s) read | Automated access / RSS | Storing | AI / LLM | Verdict |
|---|---|---|---|---|---|
| Condé Nast (Wired; also Ars Technica) | condenast.com/user-agreement | RSS content is "subject to the same terms"; no "automated process … or periodic caching" | no "store" for "any and all purposes other than indexing … for a Search Engine" | "grounding (including through RAG)" of any software incorporating generative AI is excluded from non-commercial use without written consent | **Not allowed** |
| The Guardian (Business) | theguardian.com/help/terms-of-service, /help/feeds | feeds page: RSS "for personal, non-commercial purposes in accordance with our terms of service"; terms ban any "robot … or other automated device, program … (whether for data gathering, mining, collection, reading …)" other than as set out | "scrape, reproduce … collect, mine and/or extract" banned for the purposes listed | banned: "(a) for any machine learning … and/or artificial intelligence-related purposes", "(b) … text and data aggregation, analysis or mining", "(c) with any … artificial intelligence technologies" | **Not allowed** |
| BBC (Business, Technology) | bbc.co.uk/usingthebbc/terms/can-i-use-bbc-content and /…-for-my-business, news feeds page | "You're not allowed to pluck metadata from our content or RSS feeds"; the BBC News feed may be added to your own website or social account with attribution and unchanged; business use needs permission and may carry a fee | "pluck metadata" covers it | "Anything plucked from our services to develop or train artificial intelligence or to do computer analysis" needs permission | **Not allowed** |
| TechCrunch (AI) | techcrunch.com/rss-terms-of-use, /terms-of-service | RSS: "you are only permitted to display the content that is provided in the feed, with attribution to TechCrunch, and you must link to the full article … You may not … modify our feed content"; terms ban "robots … scrapers … to monitor, extract data from, copy" | not addressed for feeds | no AI clause found | **Unclear, restrictive** (display with credit is allowed; storage and LLM use are not addressed) |
| CNBC (Business) | cnbc.com/terms, Versant terms (versantmedia.com/terms) | no RSS terms; CNBC's RSS page lists feeds only | not addressed | no AI clause found | **Unclear, restrictive**: "personal and non-commercial use only … no element of the Content may be used or exploited in any way other than as part of the authorized Versant Services" |
| Antara (Bisnis) | antaranews.com/ketentuan-penggunaan, /rss | RSS page: the feed "dapat digunakan untuk melengkapi konten situs lain" (can complement other sites' content) | not addressed | not addressed | **Unclear, restrictive**: content "non-komersial"; reproduction, communication to the public or distribution "tanpa persetujuan tertulis … dilarang keras" |
| CNBC Indonesia | cnbcindonesia.com/disclaimer | none | none | none | **Unclear, silent**: services are "untuk kebutuhan pribadi dan bukan untuk digunakan kembali secara komersial"; content protected by copyright |
| CNN Indonesia | cnnindonesia.com/disclaimer | none | none | none | **Unclear, silent**: same personal / not for commercial reuse wording; copyright |
| Katadata | katadata.co.id/disclaimer | none | none | none | **Unclear, silent**: copyright notice only |
| IDX Channel | idxchannel.com/disclaimer | none | none | none | **Unclear, silent**: accuracy disclaimer only |
| Republika (Ekonomi) | republika.co.id/page/disclaimer | none | none | none | **Unclear, silent**: "Semua hasil karya … menjadi hak cipta Republika.co.id"; information only |
| Hacker News | not read; dropped for the 419 to Node | | | | not assessed |

Exact quotes for the three "Not allowed" rows (all retrieved 2026-10-04):
- Condé Nast: "Non-commercial use does not include use of the Service — except with prior written consent — in connection with the development, training, fine tuning, grounding (including through retrieval-augmented generation (RAG)), of any large language model, foundation model, deep machine learning, generative artificial intelligence model or algorithm, or any software or tool that incorporates generative artificial intelligence." And: you may not "use … any other automated process, or engage in meta-searching or periodic caching of information, to access, visit and/or use the Service". And: you may not "copy, harvest, crawl, index, scrape, spider, mine, gather, extract, compile, obtain, aggregate, capture, access, store, or republish any Content … for any and all purposes other than indexing Content for inclusion in a Search Engine".
- Guardian: "you shall not use, copy, scrape, reproduce, alter, modify, collect, mine and/or extract the Guardian Content: (a) for any machine learning, machine learning language models and/or artificial intelligence-related purposes … (b) for any text and data aggregation, analysis or mining purposes … or (c) with any machine learning and/or artificial intelligence technologies to generate any data or content …".
- BBC: "You're not allowed to pluck metadata from our content or RSS feeds." and "Anything plucked from our services to develop or train artificial intelligence or to do computer analysis … you'll need to get permission."

What this means for the app (inference): none of the 11 publisher families I read gives explicit permission to store snippets and send them to an LLM. Three forbid it in words (Condé Nast, Guardian, BBC). Five Indonesian publishers say nothing on automation, storage or AI and only state a personal, non-commercial intent; they are the lowest-risk group but not cleared. Three (TechCrunch, CNBC, Antara) allow reading or display only and are silent on the rest.

### Feeds whose terms I read and that allow this use
| Feed | URL | Region / lang / category | Terms (read 2026-10-04) | Live test |
|---|---|---|---|---|
| The Conversation, Indonesia edition | https://theconversation.com/id/articles.atom | Indonesia / id / analysis (business, politics, tech) | Published under Creative Commons Attribution / No-derivatives (Indonesian republishing guidelines): "Artikel kami bisa direpublikasi baik secara daring ataupun cetak secara gratis" with the author's text unedited, credit to The Conversation and a link; quoting the opening lines with a link is allowed. No clause on robots, storage or AI found by keyword search of the UK-edition terms page | Node `fetch` with the project UA: 200 three times; 50 items, newest 2026-10-03; items carry the full article (median about 10,600 characters) |
| The Conversation, global | https://theconversation.com/global/articles.atom | Worldwide / en / analysis | Same publisher and licence; the global edition's own guidelines page was not read separately | 200 three times; 49 items, newest 2026-10-02 |
| Federal Reserve press releases | https://www.federalreserve.gov/feeds/press_all.xml | US / en / macro | "information on Board's website is in the public domain and may be copied and distributed without permission. Please cite to the Board as the source" | 200 three times; 20 items; first item has no description |
| ECB press | https://www.ecb.europa.eu/rss/press.html | Euro area / en / macro | "users of this website may make free use of the information … When such information is distributed or reproduced, it must appear accurately and the ECB must be cited as the source … If the information is modified by the user … this must be stated explicitly" (documents with named authors excepted) | 200 three times; 15 items, newest 2026-10-02; first item has no description |
Caveats: The Conversation is analysis, not breaking news; with a No-derivatives licence keep the stored snippet unmodified, show the credit, and treat LLM output as the app's own commentary, never as a rewritten version of the article. Fed and ECB cover monetary policy only. None of this is general business or tech news: I found no commercial publisher that explicitly allows storing plus LLM triage, so there is no like-for-like replacement for the "Not allowed" feeds. Not suitable: World Bank (non-commercial only, "you may not make any derivative work"; the blog feed URL I tried returned 404), IMF (feed returned 403).

### Options for the Tech Lead (not decided here)
1. Accept the risk knowingly for a personal, single-user app, per publisher; the terms above still say no for Condé Nast, Guardian and BBC.
2. Drop the "Not allowed" feeds (Wired, Ars Technica, Guardian, BBC Business, BBC Technology) and keep the Indonesian feeds plus the open-licence feeds above. This loses most global business news; The Conversation, Fed and ECB only partly fill it.
3. Tiered ingestion: only open-licence and "silent" feeds go to the LLM; the others are not ingested. (Link-only still stores a title and link, which the BBC wording also covers, so it is not a clean middle path.)
Unverified: whether any publisher would grant written permission for personal use (not asked); the global Conversation guidelines page; Indonesian copyright law as applied to headline snippets (not read); whether publishers enforce these terms against personal single-user use.
