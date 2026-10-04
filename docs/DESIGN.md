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
| 7 | Venture view | `/[locale]/ventures/[slug]` | For one of the owner's ventures: build progress from its project board, and the Indonesia / worldwide market view from the news (scores, factor breakdown, tailwinds and headwinds with evidence, related news). Spec: [design/venture-view.md](design/venture-view.md). |

## How it works (no separate backend)
- A scheduled server job fetches RSS and price data, stores it, and page views only ever read the store. API keys stay in server env vars.
- Signals come from fixed, published rules on price data (trend: 50/200-day averages; momentum: RSI; plus currency and a news check). The LLM writes the explanation and the bilingual text; it does not decide the signal.
- Opportunities: the LLM clusters the day's news into themes, scores each on Demand, Timing, Competition, Capital efficiency and Regulatory risk, and must cite the articles it used.
- Every signal screen states: rule-based information, not financial advice.

## Look
**Dark mode** (the only theme): a dark purple theme: page is a clear gradient (violet #5B34A6 glow top-left, magenta #7A2E8E glow right, over #2E1C57 → #1D1236), cards are glass: 8% white fill, 18px backdrop blur, 16% white border, soft shadow (purple glows repeat lower on the page so the glass reads everywhere), borders #4B3E75, text #FAF8FF / muted #D4CEE6 (was #C1B9DA; lightened 2026-10-04 to reach 4.5:1 on the glass card); non-text lines and borders (e.g. the 200-day average, `--chart-4`) stay #C1B9DA, one teal accent (#2DD4BF), orange (#FB923C) for sell/down. Geist + Geist Mono. Buy/sell always carry a word (and a shape on charts), never colour alone. Top navigation that wraps on phones.

## Decisions
Numbering matches the sprint plan in Notion (D1–D16). Rows marked "Designer, delegated" were decided under the Tech Lead's 2026-10-04 rule "decide inside the ticket"; he confirms them at merge.
| # | Decision | Options | Status / recommendation |
|---|----------|---------|----------------|
| 1 | AI provider for summaries, scoring and reports | Claude API / 9router / no AI | **Decided 2026-10-04: 9router**, through an OpenAI-compatible client (base URL, key, model from server env). Base URL, key, model names and budget cap still to be provided |
| 2 | Storage | Options in the Engineer's infrastructure proposal (OR-48) | **Local first (2026-10-04): Postgres in docker compose.** AWS storage parked with infrastructure (Tech Lead: "focus on local run") |
| 3 | Hosting | Local or own server / Vercel / AWS | **Parked 2026-10-04**: the app runs locally first; AWS (Lambda) chosen earlier, concrete option in OR-48, OR-5/OR-20 Unscheduled |
| 4 | Alert delivery | In-app only / + Telegram / + email | **Decided 2026-10-04 (Designer, delegated): in-app only** for now; Telegram OR-42 and email OR-43 unscheduled |
| 5 | Login | Single password / none (local only) | **Parked** with infrastructure: not needed for a local run; recommendation single password when hosted (OR-19) |
| 6 | Ticket board | Files in docs/tickets / a Notion board like Performa Vision | **Decided 2026-10-03: Notion**, same structure as Performa Vision |
| 7 | Antam / Pegadaian retail gold price | Spot price converted to IDR per gram / manual entry | **Decided 2026-10-04 (Designer, delegated): spot converted**; manual entry OR-46 unscheduled |
| 8 | Where venture progress comes from | Read each project's board (Notion / GitHub) on the server / typed in by hand | Open. Board read for Performa Vision (Notion exists); Meta Klinik needs its board named |
| 9 | Data-source terms (Yahoo chart endpoint, gold-api.com) | Accept for personal use / use paid sources | **Open (Tech Lead)**: built on recorded fixtures; live calls wait in OR-53 (Yahoo) and OR-54 (gold-api.com) |
| 10 | Signal wording (advice vs information) | See `docs/signals/rules-v1.md` §7 | **Decided 2026-10-04 by the Designer on the Tech Lead's delegation**: describe, never instruct; banned-phrase list; the separate currency and news checks are context only (gold/silver run on an IDR series, so the rupiah moves their price and can change their verdict); "Suggested approach…" removed. Tech Lead to confirm at merge |
| 11 | Overall opportunity score | Equal-weight mean / weighted | **Decided 2026-10-04 by the Designer on the Tech Lead's delegation**: equal-weight mean, `Math.round` (`docs/opportunities/scoring-v1.md`). Tech Lead to confirm at merge |
| 12 | Default language | English / Indonesian | **Decided 2026-10-04: English** |
| 13 | New dependencies | Test runner, browser tests, DB driver/ORM, RSS parser, LLM SDK | **Approved 2026-10-04**; anything else, or with licence/cost impact, goes back to the Tech Lead |
| 14 | Sprint 1 commitment | — | **Approved 2026-10-04**: about 28 Engineer points, later sprints sized from actuals |

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
- 2026-10-04 — Tech Lead: AI provider 9router (OpenAI-compatible), hosting AWS Lambda, storage follows S3, default language English, dependencies and Sprint 1 commitment approved. Decisions table renumbered to match the sprint plan (D1–D14 shown).
- 2026-10-04 — Tech Lead: the Engineer drafts the infrastructure proposal and the CDK ticket (OR-48); database preference EC2 + docker compose, cost-efficient. Storage and hosting rows updated; OR-5/6/7/20 scope waits for his pick.
- 2026-10-04 — OR-12: all UI copy in EN and ID plus screen states and stale thresholds in `docs/design/copy.md`. Muted text #C1B9DA → #D4CEE6 (3.79:1 → 4.66:1 on the card at the violet glow, OR-1). Advice-like canvas wording replaced ("Suggested approach…", instruction-like risk texts, "avoided −6.2%"), per D10 decided by the Designer on the Tech Lead's delegation.
- 2026-10-04 — OR-35: screen 7, Venture view (`/[locale]/ventures/[slug]`), spec in `docs/design/venture-view.md`; one tailwind/headwind pair per venture, as on the Radar card.
- 2026-10-04 — Muted colour scope: #D4CEE6 is for text only; chart lines and borders keep #C1B9DA (`--chart-4` in the app). Reference files aligned.
- 2026-10-04 — OR-11: opportunity scoring v1, output contract and JSON Schema, 18 sectors and 36 themes (`docs/opportunities/scoring-v1.md`); D11 equal-weight mean. QA follow-up: the contract's region value is `global` (as stored for articles), not `worldwide`; "Worldwide" stays a UI label.
- 2026-10-04 — Calculators: amounts from Rp 1,000 trillion upwards show "more than Rp 1,000 trillion" (`calc.result.beyond`); no exponent notation.
- 2026-10-04 — Sample (synthetic) prices: `copy.md` §8.2 labels every surface that shows them ("Sample data, not real prices"); no alerts from sample data. Tech Lead (delegated, via Orchestrator), option C: in normal use no verdict is shown on sample data (`signal.sample`, "No signal: sample data"), no markers or report details; the dev/QA switch `SHOW_SAMPLE_SIGNALS=1` (must be ignored in production; required by OR-29 and OR-30, not built yet) shows labelled verdicts (`rules-v1.md` §6).
- 2026-10-04 — Opportunity matching (OR-50): a matched opportunity's text is refreshed only on the same theme with at least one shared cited article; otherwise only citations are added. Applied in code from stored data (`scoring-v1.md` §4).
- 2026-10-04 — News (OR-21): theme labels `news.theme.<id>` come from `scoring-v1.md` §8; the Trending themes card skips `other` and is omitted when empty; Themes above Sources on desktop, list → Themes → Sources on phones (`copy.md` §3, §11).
- 2026-10-04 — News: "Why it matters" carries an "AI" mark (`news.whyAi`, screen-reader text `news.whyAiSr`) on News, Radar and venture surfaces, so our text is never mistaken for the publisher's (`copy.md` §3).
- 2026-10-04 — Wording rule D10 extended to all AI-written text (brief, triage, opportunities, venture winds, signal explanations): one shared guard with a general list and a stricter signal list (`rules-v1.md` §7.4, OR-63).
- 2026-10-04 — Wording guard lists extended with the Reviewer's evasion gaps (inflections, "consider buying", "buy the dip", unhedged forecast verbs, "risk-free", ID "layak dibeli", "saatnya …"); bare "wajib" on the signal list only (`rules-v1.md` §7.4, OR-63).
- 2026-10-04 — Wording guard: forecast verbs ("will rise / surge / increase …") are rejected in general AI text only with a price or market subject, so announced policy can be reported ("VAT will increase to 12%"); signal explanations still reject them all (`rules-v1.md` §7.4, OR-63).
- 2026-10-04 — Wording guard, forecasts (Orchestrator, delegated): the general-list rule is inverted. "will"/"akan" + forecast verb is rejected unless a policy noun precedes it ("VAT will increase" passes, "The rupiah will fall" and "Demand will rise" do not); forecasts are written as sourced expectations (`rules-v1.md` §7.4, OR-63).
- 2026-10-04 — Radar (OR-23): stale banners per section (brief, opportunities), never-run card, and the "Linked to N opportunities" line on Radar news rows (`radar.news.linked`) (`copy.md` §5).
- 2026-10-04 — Wording guard, forecasts (Reviewer's PR 65 points): policy noun in the same clause only; "going to / set to / likely to / bakal" count as "will"; "expected to / diperkirakan" need an attribution in the same sentence; rejections counted per job (`rules-v1.md` §7.4, OR-63).
- 2026-10-04 — Signal staleness: IDX stocks allow 12 days (was 10) across the Idul Fitri closure, from a per-year closure list; 2027's closure is 11 days (R-6) (`rules-v1.md` §4, OR-29).
- 2026-10-04 — Signal report (OR-29 questions): momentum check word from the RSI 50 midline (display only, never a verdict), keys `signal.check.rsiAbove50` / `rsiBelow50`; reversal keys `signal.reverse.rsiBackBelow70` / `rsiBackAbove30` for a stretched RSI coming back into range (`rules-v1.md` §3.3, `copy.md` §8.1).
- 2026-10-04 — Signal report (Orchestrator, delegated, on the Reviewer's PR 73 nit): the momentum row is display only and marked "not counted" (`asset.verdict.notCounted`); the checks counter appears on the long-term card only (`rules-v1.md` §3.3, `copy.md` §8.1).
- 2026-10-04 — `docs/upkeep.md`: scheduled upkeep (September IDX closure table, holiday list, terms review, 9router key rotation, database size).
- 2026-10-04 — Radar market snapshot (OR-28): visible as-of text (no hover), per-row "Out of date" word plus one section stale line, market-closed on the row, ▲/▼/— with accessible up/down/unchanged labels (`copy.md` §5).
- 2026-10-04 — Wording guard follow-ups (Orchestrator, delegated; OR-64): normalisation, more clause breaks, filler words and would/shall in forecasts, the authority-word exception for "must + buy/sell", "recommend" banned in every form (`rules-v1.md` §7.4).
- 2026-10-04 — Wording guard refinements (OR-64): decimals and abbreviations are not sentence ends; the authority word must be within 8 words of "must + buy/sell" in the same sentence, and not as the subject of an attribution; rejections log the matched entry (`rules-v1.md` §7.4).
- 2026-10-04 — Wording guard: the attribution verb list for the authority-word rule is extended (show, report, note, warn, claim, estimate; menunjukkan, melaporkan, mencatat, menyebut, memperingatkan, menyatakan) (`rules-v1.md` §7.4, OR-64).
- 2026-10-05 — My ventures cards (OR-39): plain related-news count `radar.ventures.related` until OR-51's link; no-score and never-scored states reuse venture-view.md (`copy.md` §5).
