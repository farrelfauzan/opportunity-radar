# Signal rules v1 (`rules v1`)

Ticket OR-10. Implemented by OR-29 (engine), explained by OR-33 (text), shown by OR-30/31/32/34.
Decided 2026-10-04 by the Designer on the Tech Lead's delegation (D10 wording, rule details), from the Researcher's inputs (R-2, branch `research/r-2`). The Tech Lead can overrule any part at merge.

**What a signal is:** the result of fixed, published rules applied to daily closing prices. It is information for the owner's own decision, not advice. No LLM or news item changes a verdict in v1. The rules run on the asset's own price series; for gold and silver that series is in IDR (see §1), so a rupiah move is part of the price and can change their verdict. The separate "Currency" check (§3.3) is context only and never adds to or overrides a verdict.

## 1. Inputs per asset

| Asset (v1 watchlist) | Series used for the rules | Shown price | Notes |
|---|---|---|---|
| IHSG `^JKSE`, BBCA `BBCA.JK` | Yahoo daily closes (IDR) | latest quote | — |
| S&P 500 `^GSPC` | Yahoo daily closes (USD) | latest quote (USD) | USD/IDR shown as context |
| Gold, silver | **COMEX futures daily closes** (`GC=F`, `SI=F`) converted to IDR per gram: `close_idr_per_gram = close_usd_per_troy_oz / 31.1034768 × usd_idr`, with the USD/IDR rate of the same date, or the latest rate before it on days without one (weekends, holidays) | gold-api.com spot, IDR per gram | gold-api.com has no history on the keyless tier (Researcher, live-tested), so a spot history cannot be built today. The header says "signal computed on COMEX futures closes" (`asset.kind.metalFutures`). Futures were about 0.5% above spot on 2026-10-04 |
| Bitcoin, Ethereum | Binance `data-api.binance.vision` daily klines (USDT treated as USD) | latest quote | IDR price from Indodax where shown |
| Cash & bonds | none | — | No signal; the risk card only (`signal.noSignal`) |

Until OR-53/OR-54 (live checks, blocked on D9) the Yahoo and gold-api.com series come from recorded fixtures.

Known limit of the futures series: Yahoo's continuous `GC=F` / `SI=F` can jump when the front contract rolls, which moves SMA and RSI without a real price move. v1 accepts this. OR-27 records the fixtures, checks them for jumps of more than 3% in a single day near roll months, and logs any it finds; a back-adjusted series is a later improvement.

## 2. Definitions

- **Row** = one stored daily close. SMA50 = mean of the last 50 rows; SMA200 = mean of the last 200 rows. Rows, not calendar days (stocks ~5 a week, crypto and metals ~7).
- **RSI14 (Wilder)**: change[i] = close[i] − close[i−1]. First avgGain / avgLoss = simple mean of the first 14 gains / losses (needs 15 closes). Then avg = (previous × 13 + current) / 14. RSI = 100 × avgGain / (avgGain + avgLoss). Both zero (flat) → 50. avgLoss 0 and avgGain > 0 → 100. avgGain 0 and avgLoss > 0 → 0.
- Comparisons are strict (`>`/`<`); equality goes to HOLD as the tables say. Compute in full precision; round only for display (2 decimals).

## 3. Decision tables

### 3.1 Short term (days to weeks), needs ≥ 50 rows

| RSI14 | close vs SMA50 | Verdict |
|---|---|---|
| < 30 or > 70 | any | HOLD (stretched) |
| 30 to 70 inclusive | close > SMA50 | BUY |
| 30 to 70 inclusive | close < SMA50 | SELL |
| 30 to 70 inclusive | close = SMA50 | HOLD |

RSI exactly 30 or exactly 70 is not stretched.

### 3.2 Long term (1 year and more), needs ≥ 200 rows

| SMA50 vs SMA200 | close vs SMA200 | Verdict |
|---|---|---|
| SMA50 > SMA200 | close > SMA200 | BUY |
| SMA50 < SMA200 | close < SMA200 | SELL |
| any other combination, including any equality | | HOLD |

Rules use states, not events: there is no "crossed within N days" rule.

### 3.3 Checks shown on the report (OR-32)

| Check | Term | Counts toward "{n} of {m} checks agree" | Verdict word |
|---|---|---|---|
| Momentum (RSI14 between 30 and 70) | short | **no** (display only) | Supports buy / Supports sell / Neutral, marked "not counted" |
| Trend: close vs SMA50 | short | yes | Supports buy / Supports sell / Neutral |
| Trend: SMA50 vs SMA200 | long | yes | Supports buy / Supports sell / Neutral |
| Trend: close vs SMA200 | long | yes | Supports buy / Supports sell / Neutral |
| Currency: USD/IDR change over 30 days | both (IDR-priced gold/silver, US stocks) | **no** | Context only |
| News check (OR-33: supportive / against counts) | both | **no** | Context only |

Counter (Orchestrator on the Tech Lead's delegation, 2026-10-04, on the Reviewer's PR 73 nit): the momentum row never counts toward "{n} of {m} checks agree", because its word comes from the 50 midline, which never changes a verdict (the 30 and 70 limits act through §3.1, and a stretched RSI is named by the HOLD trigger). That leaves one counted check in the short term, so the short-term card shows **no** counter; the long-term card shows "{n} of 2 checks agree".

Momentum word (OR-29 question, decided 2026-10-04): RSI14 between 30 and 70 inclusive → "Supports buy" above 50, "Supports sell" below 50, "Neutral" at exactly 50; RSI outside 30–70 → "Neutral" (stretched: it is what makes the short term HOLD). The 50 midline is used for this display word only; it never changes a verdict.

"Agree" = rule checks pointing the same way as the verdict; for HOLD, the count is of Neutral checks. Currency and news never move a verdict in v1 (D10).

## 4. Data quality, history and staleness

| Case | Result (per term) |
|---|---|
| Fewer rows than needed (short < 50, long < 200; RSI needs 15) | `INSUFFICIENT`: no verdict, shown as `signal.none` |
| Any close ≤ 0 in the series | whole series rejected: `INVALID_DATA`, no verdict, logged |
| Several rows for one date | keep the last one |
| Gaps in dates | not filled; rows counted as they are |
| Latest close older than 7 calendar days (stocks), 4 (metals), 3 (crypto) | `STALE`: no verdict; IDX stocks use 12 days from the last close before the IDX Idul Fitri closure until the first close after it (limit = age in calendar days; equal to the limit is fine). The closure dates are a config list per year (2026: last close Tue 17 Mar, reopens Wed 25 Mar; 2027: last close Fri 5 Mar, reopens Tue 16 Mar; R-6), extended each September when IDX publishes its calendar; a year missing from the list falls back to 7 days (no verdict for a few days, the safe side). Metals use 4 so a US Monday holiday after a weekend does not trip it |
| Cash & bonds | no signal |

## 5. What would change the signal (OR-32 "What would change this to …")

A reversal price is the nearest price, on a 0.01 grid, at which the verdict for that term differs from the current one, when the latest close is replaced by that price and all other rows stay fixed (as in `expected.json`). Search up to 3× and down to 10% of the latest close; outside that range, "none".
For the latest close replaced by a hypothetical close x:
- Short term BUY ↔ SELL flips at x = mean of the 49 closes before the last one (= the SMA50 boundary).
- Short term to or from HOLD via RSI: the x where RSI14 crosses 30 or 70, found by search to 0.01 (RSI is monotonic in x).
- Long term close-vs-SMA200 flips at x = mean of the 199 closes before the last one.
- SMA50 vs SMA200 is a state of the series, shown as text ("the 50-day average moving below the 200-day average"), not as a price.
Show at most two reversal conditions, as prices formatted per locale. These prices are the only prices the explanation text (OR-33) may mention.

## 6. History and alerts

- **Sample data:** a series whose source is `synthetic` (made-up prices until live sources are on) still goes through the rules, for the engine's tests, and its signal and history rows are stored with `synthetic = true`. In normal use no screen shows a verdict for it (the no-verdict state `signal.sample` is shown instead), no chart marker is drawn and no explanation is shown; no alert is raised in any mode. For development and QA only, the server env switch `SHOW_SAMPLE_SIGNALS=1` (off by default, never set in production) shows these verdicts with the sample labels (`docs/design/copy.md` §8.2).

- `signal_history` gets a row only when a verdict (BUY / HOLD / SELL) changes. `STALE`, `INSUFFICIENT` and `INVALID_DATA` are states, not verdicts: they write no history row and raise no alert; the last verdict stays in history unchanged. The first verdict computed for an asset and term is an `initial` baseline: no alert, no chart marker (OR-29, OR-31, OR-34).
- The history column shows "Price change since signal: {pct}" (`asset.history.change`), never "avoided" or "gained" language.
- Every stored and shown signal carries the version string `rules v1`.

## 7. Wording rules (D10)

1. BUY / HOLD / SELL (BELI / TAHAN / JUAL) always as a word; on charts also a shape (▲ buy, ▼ sell).
2. Describe what the rules see; never instruct. No sizing, timing or allocation advice, no price targets, no promises about returns.
3. Disclaimers (copy keys in `docs/design/copy.md`):
   - Short, on Radar alerts: "Rule-based signals, not financial advice." / "Sinyal berbasis aturan, bukan nasihat keuangan."
   - Full, on Investments and every asset report: `inv.disclaimer`.
4. Scope (Tech Lead, delegated, via the Orchestrator, 2026-10-04): "describe, never instruct" applies to **every** AI-written text: daily brief, triage `why`, opportunity text, venture winds and signal explanations. One shared guard with one phrase file checks them where each output's contract is checked (OR-63): a hit is a contract violation (one retry, then nothing stored). Static copy is checked by the Reviewer.
   - **General list** (all AI text): advice addressed to the reader and buy/sell instructions: "you should", "you must", "you need to", "we recommend", "recommend", "buy now", "sell now", "act now", "follow the signal(s)", "good time to", "take profit", "taking profit", "stop loss", "your portfolio", "guaranteed", "target price", "don't miss"; ID "Anda harus", "Anda sebaiknya", "sebaiknya Anda", "kami sarankan", "disarankan", "Anda perlu", "beli sekarang", "jual sekarang", "segera beli", "segera jual", "ikuti sinyal", "waktu yang tepat untuk", "ambil untung", "dijamin", "pasti naik", "pasti turun", "target harga", "jangan lewatkan", "portofolio Anda"; and *should / must / need to / harus / sebaiknya / perlu* followed within two words by *buy / sell / invest / hold / accumulate / beli / jual / membeli / menjual / investasi / tahan / akumulasi*. Also (Reviewer's evasion gaps, 2026-10-04): inflections "recommend(s|ed|ing)", "advise(s|d)", "advised to"; "consider buying", "consider selling", "ought to", "time to buy", "time to sell", "now is the time", "buy the dip", "risk-free", "can't lose", "cannot lose"; forecasts (inverted rule, Orchestrator on the Tech Lead's delegation, 2026-10-04): "will" (optionally + likely / probably / certainly / continue to) followed by a forecast verb (rise, fall, drop, surge, soar, crash, increase, decrease, jump, plunge, weaken, strengthen, climb, slide, rally, rebound, tumble, decline, grow, gain, recover, collapse, spike, sink) is rejected **unless** a policy noun (tax(es), VAT, rule(s), regulation(s), law(s), fee(s), tariff(s), duty / duties, import duties, quota(s), subsidy / subsidies, ban, deadline, permit(s), licence(s) / license(s), levy, excise, minimum wage) is within the four words before "will"; ID "akan" (optionally + terus / segera) + naik, turun, melonjak, anjlok, menguat, melemah, meningkat, menurun, merosot, jatuh, tumbuh, pulih, unless pajak, PPN, tarif, aturan, peraturan, regulasi, undang-undang, UU, biaya, bea, bea masuk, cukai, kuota, subsidi, larangan, tenggat, batas waktu, izin, lisensi, pungutan, upah minimum, UMP or UMR is within the four words before "akan". The policy noun must be in the same clause: no comma, semicolon or clause word (means, so, that, because, while, and, but / berarti, sehingga, karena, sementara, dan, tetapi) between it and "will"/"akan". "is/are going to", "set to", "poised to", "bound to", "is/are likely to" and ID "bakal" count as "will"/"akan". "expected / forecast / projected / predicted to" + forecast verb and ID "diperkirakan / diprediksi (akan)" + verb pass only with an attribution in the same sentence (according to, said, says, announced, reported / menurut, kata, mengatakan, mengumumkan, melaporkan); the guard checks that an attribution is written, not that it is true (the cited article ids are the contract's check). So "VAT will increase to 12% from January" and "Demand is expected to increase, according to the ministry" pass, while "The rupiah will fall", "Demand will rise", "The VAT rise means demand will fall" and an unattributed "Demand is expected to increase" are rejected. An attribution excuses only the "expected to" / "diperkirakan" forms, never a plain "will"/"akan": "The minister said gold will surge" and "Menurut analis, harga emas akan melonjak" are rejected, while "Gold is expected to surge, according to the minister" passes. Each job counts rejections (`wording_rejected`); ID "Anda wajib", "layak dibeli", "layak dijual", "saatnya membeli", "saatnya menjual", "saatnya beli", "saatnya jual", "tanpa risiko". Bare "must" / "harus" / "wajib" are allowed here, so regulation can be described ("Platforms must verify sellers", "Platform wajib memverifikasi penjual"), and opportunity first steps may be imperative.
   - **Signal list** (signal explanations, OR-33): the general list plus bare "wajib", "will" + any of the forecast verbs above whatever the subject, and the phrases below (case-insensitive, whole words):
   - EN: "should", "must", "recommend", "we recommend", "you need to", "follow the signal", "follow the signals", "good time to", "take profit", "stop loss", "buy in" followed by a number and "parts" or "steps", "avoid", "avoided", "core of", "only a small", "your portfolio", "guaranteed", "will rise", "will fall", "target price"
   - ID: "sebaiknya", "harus", "kami sarankan", "disarankan", "Anda perlu", "ikuti sinyal", "waktu yang tepat untuk", "ambil untung", "hindari", "inti dari", "porsi kecil saja", "dijamin", "pasti naik", "pasti turun", "target harga"
5. Removed from the canvas: "Suggested approach: buy in 3 parts over 6 weeks rather than all at once" (Asset), "Small speculative share only" and "core of an emergency fund" (Investments risk cards, reworded in `copy.md` §7.1), "avoided −6.2%" (history).
6. Context, not a legal opinion and **not verified**: the Researcher recalls that personalised investment advice in Indonesia is a licensed activity under OJK (investment adviser licence); nobody checked the regulation on 2026-10-04. The app gives impersonal, rule-based information for its single owner; check this before sharing it with anyone else.

## 8. Fixtures and expected values

`docs/signals/fixtures/`: 15 CSV series (`date,close`), `expected.json`, `README.md` (expected SMA50 / SMA200 / RSI14, verdicts, flip prices, stale cases), `gen_fixtures.py` (exact arithmetic) and `check.py` (independent float check). From the Researcher's branch `research/r-2`, commit d10d43e.

| File | Short | Long | Covers |
|---|---|---|---|
| rising_noisy | BUY | BUY | normal uptrend |
| falling_noisy | SELL | SELL | normal downtrend |
| flat | HOLD | HOLD | RSI 50, all equalities |
| all_gain | HOLD | BUY | RSI 100 (stretched) |
| all_loss | HOLD | SELL | RSI 0 (stretched) |
| len_14 / len_15 / len_49 | INSUFFICIENT | INSUFFICIENT | history thresholds |
| len_50 / len_199 | HOLD | INSUFFICIENT | short starts at 50 |
| len_200 | HOLD | BUY | long starts at 200 |
| len_201 | BUY | BUY | — |
| gap | BUY | BUY | gaps not filled |
| duplicate_date | BUY | BUY | last row per date wins |
| nonpositive_close | INVALID_DATA | INVALID_DATA | close ≤ 0 |

OR-29's unit tests must reproduce every verdict, SMA, RSI (to 0.01) and flip price in `expected.json`. The CSV fixtures do not land exactly on RSI 30 or 70, so OR-29 also unit-tests the boundary directly: a stubbed RSI of exactly 30.00 and 70.00 with close > SMA50 gives BUY (not stretched), 29.99 and 70.01 give HOLD.
