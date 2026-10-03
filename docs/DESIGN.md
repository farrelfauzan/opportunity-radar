# Opportunity Radar — design

Status: **design settled by the Tech Lead** (2026-10-03, relayed by the Orchestrator); the decisions table below is still open. Nothing is built yet.
Tickets: Notion → Opportunity Radar → Development Board (https://app.notion.com/p/7afaeda6eb7f4091954c59e458c7dc08); sprint plan https://app.notion.com/p/3ee52ed08ee281728215ebe9691b17a1
Design canvas (screens, sample data only): https://claude.ai/artifact/Q15NYcBsWEAcCPQEsZ5nnX
Data sources: [research/R-1-data-sources.md](research/R-1-data-sources.md)

## Objective
1. **First:** find and assess business opportunities in Indonesia and worldwide, from current business, politics/policy and tech/AI news.
2. **Second:** investments (stocks, gold, silver, crypto, cash/bonds): risk per asset type, short- and long-term buy/sell signals, alerts, and a report explaining each signal.

Single user (the owner). Bilingual: English and Bahasa Indonesia.

## Screens
| # | Screen | Route | What it answers |
|---|--------|-------|-----------------|
| 1 | Radar (home) | `/[locale]` | What changed today that matters? Daily brief, **My ventures** (Performa Vision, Meta Klinik: build progress + opportunity score for Indonesia and worldwide, tailwinds/headwinds from the news), top opportunities, investment alerts, market snapshot, key news. |
| 2 | Opportunities | `/[locale]/opportunities` | Which opportunities exist, how strong (score 0–100 with a 5-factor breakdown), why now (linked news), risks, first steps to validate. |
| 3 | News | `/[locale]/news` | Headlines by category and region, each with "why it matters" and its linked opportunity. Headline, snippet and link only. |
| 4 | Investments | `/[locale]/invest` | Risk of each asset type (1–5, typical drop, main risks, fit for short vs long term), watchlist with signals, alerts. |
| 5 | Asset report | `/[locale]/invest/[asset]` | Price chart with averages and signal markers, short- and long-term signal, the report: why buy/sell, risks, what would reverse the signal, signal history. |
| 6 | Calculators | `/[locale]/calculators` | Provisional projections from the user's own assumptions. Investment: start amount, monthly top-up, years, return ± uncertainty, inflation → pessimistic/base/optimistic value and value in today's money. Business: capital, fixed cost, revenue, growth, margin → break-even month, payback month, lowest cash point, net cash. Runs in the browser; no data source. |

## How it works (no separate backend)
- A scheduled server job fetches RSS and price data, stores it, and page views only ever read the store. API keys stay in server env vars.
- Signals come from fixed, published rules on price data (trend: 50/200-day averages; momentum: RSI; plus currency and a news check). The LLM writes the explanation and the bilingual text; it does not decide the signal.
- Opportunities: the LLM clusters the day's news into themes, scores each on Demand, Timing, Competition, Capital efficiency and Regulatory risk, and must cite the articles it used.
- Every signal screen states: rule-based information, not financial advice.

## Look
**Dark mode** (the only theme): a dark purple theme: page is a clear gradient (violet #5B34A6 glow top-left, magenta #7A2E8E glow right, over #2E1C57 → #1D1236), cards are glass: 8% white fill, 18px backdrop blur, 16% white border, soft shadow (purple glows repeat lower on the page so the glass reads everywhere), borders #4B3E75, text #FAF8FF / #C1B9DA, one teal accent (#2DD4BF), orange (#FB923C) for sell/down. Geist + Geist Mono. Buy/sell always carry a word (and a shape on charts), never colour alone. Top navigation that wraps on phones.

## Decisions waiting for the Tech Lead
| # | Decision | Options | Recommendation |
|---|----------|---------|----------------|
| 1 | AI provider for summaries, scoring and reports | Claude API (needs a key, roughly $4–15/month by model) / no AI, rules only | Claude API: small model for headline triage, mid model for reports |
| 2 | Storage | SQLite file (self-hosted) / hosted Postgres (needed on Vercel) | Follows decision 3 |
| 3 | Hosting | Local or own server / Vercel | Decide early: Yahoo and some RSS feeds may block datacentre IPs |
| 4 | Alert delivery | In-app only / + Telegram / + email | In-app first, Telegram second |
| 5 | Login | Single password / none (local only) | Single password if it is ever reachable from the internet |
| 6 | Ticket board | Files in docs/tickets / a Notion board like Performa Vision | **Decided 2026-10-03: Notion**, same structure as Performa Vision |
| 8 | Where venture progress comes from | Read each project's board (Notion / GitHub) on the server / typed in by hand | Board read for Performa Vision (Notion exists); Meta Klinik needs its board named |
| 7 | Antam / Pegadaian retail gold price | Spot price converted to IDR per gram / manual entry | Spot converted; no usable API exists |

## Changelog
- 2026-10-03 — first draft: five screens plus the Indonesian dashboard.
- 2026-10-03 — Tech Lead: the app uses dark mode. All screens converted.
- 2026-10-03 — Tech Lead: pure dark was too dark. Lighter slate-blue palette with a gradient page background.
- 2026-10-03 — Tech Lead: go with dark purple. Palette changed from slate-blue to purple, gradient kept.
- 2026-10-03 — Tech Lead: gradient must be visible. Stronger page gradient and a subtle gradient on cards.
- 2026-10-03 — Tech Lead: glass cards. Cards and header are translucent with backdrop blur.
- 2026-10-03 — Tech Lead: Radar tracks own ventures (Performa Vision, Meta Klinik): progress and Indonesia/worldwide opportunity.
- 2026-10-03 — Tech Lead: add investment and business calculators for provisional projections. New screen 6.
- 2026-10-03 — Tech Lead: design settled, implementation starts; tickets live in Notion (decision 6). Backlog OR-1…OR-47 drafted. Gaps found and ticketed: Indonesian copy exists only for Radar and no screen has empty/loading/error/stale designs (OR-12); "Open venture view" has no screen spec (OR-35). Wording on Asset/Investments flagged as advice-like for the Tech Lead (sprint plan D10, ticket OR-10).
