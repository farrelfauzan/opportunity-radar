# Signal rules v1 (`rules v1`)

Ticket OR-10. Implemented by OR-29 (engine), explained by OR-33 (text), shown by OR-30/31/32/34.
Decided 2026-10-04 by the Designer on the Tech Lead's delegation (D10 wording, rule details), from the Researcher's inputs (R-2, branch `research/r-2`). The Tech Lead can overrule any part at merge.

**What a signal is:** the result of fixed, published rules applied to daily closing prices. It is information for the owner's own decision, not advice. No LLM, news item or currency move changes a verdict in v1.

## 1. Inputs per asset

| Asset (v1 watchlist) | Series used for the rules | Shown price | Notes |
|---|---|---|---|
| IHSG `^JKSE`, BBCA `BBCA.JK` | Yahoo daily closes (IDR) | latest quote | — |
| S&P 500 `^GSPC` | Yahoo daily closes (USD) | latest quote (USD) | USD/IDR shown as context |
| Gold, silver | **COMEX futures daily closes** (`GC=F`, `SI=F`) converted to IDR per gram with the same day's USD/IDR (latest earlier rate on weekends/holidays) | gold-api.com spot, IDR per gram | gold-api.com has no history on the keyless tier (Researcher, live-tested), so a spot history cannot be built today. The header says "signal computed on COMEX futures closes" (`asset.kind.metalFutures`). Futures were about 0.5% above spot on 2026-10-04 |
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
| Momentum (RSI14 between 30 and 70) | short | yes | Supports buy / Supports sell / Neutral |
| Trend: close vs SMA50 | short | yes | Supports buy / Supports sell / Neutral |
| Trend: SMA50 vs SMA200 | long | yes | Supports buy / Supports sell / Neutral |
| Trend: close vs SMA200 | long | yes | Supports buy / Supports sell / Neutral |
| Currency: USD/IDR change over 30 days | both (IDR-priced gold/silver, US stocks) | **no** | Context only |
| News check (OR-33: supportive / against counts) | both | **no** | Context only |

"Agree" = rule checks pointing the same way as the verdict; for HOLD, the count is of Neutral checks. Currency and news never move a verdict in v1 (D10).

## 4. Data quality, history and staleness

| Case | Result (per term) |
|---|---|
| Fewer rows than needed (short < 50, long < 200; RSI needs 15) | `INSUFFICIENT`: no verdict, shown as `signal.none` |
| Any close ≤ 0 in the series | whole series rejected: `INVALID_DATA`, no verdict, logged |
| Several rows for one date | keep the last one |
| Gaps in dates | not filled; rows counted as they are |
| Latest close older than 7 calendar days (stocks), 3 (crypto, metals) | `STALE`: no verdict; IDX stocks use 10 days in Lebaran week (limit = age in calendar days; equal to the limit is fine) |
| Cash & bonds | no signal |

## 5. What would change the signal (OR-32 "What would change this to …")

For the latest close replaced by a hypothetical close x (all other rows fixed):
- Short term BUY ↔ SELL flips at x = mean of the 49 closes before the last one (= the SMA50 boundary).
- Short term to or from HOLD via RSI: the x where RSI14 crosses 30 or 70, found by search to 0.01 (RSI is monotonic in x).
- Long term close-vs-SMA200 flips at x = mean of the 199 closes before the last one.
- SMA50 vs SMA200 is a state of the series, shown as text ("the 50-day average moving below the 200-day average"), not as a price.
Show at most two reversal conditions, as prices formatted per locale. These prices are the only prices the explanation text (OR-33) may mention.

## 6. History and alerts

- `signal_history` gets a row only when a verdict changes. The first verdict computed for an asset and term is an `initial` baseline: no alert, no chart marker (OR-29, OR-31, OR-34).
- The history column shows "Price change since signal: {pct}" (`asset.history.change`), never "avoided" or "gained" language.
- Every stored and shown signal carries the version string `rules v1`.

## 7. Wording rules (D10)

1. BUY / HOLD / SELL (BELI / TAHAN / JUAL) always as a word; on charts also a shape (▲ buy, ▼ sell).
2. Describe what the rules see; never instruct. No sizing, timing or allocation advice, no price targets, no promises about returns.
3. Disclaimers (copy keys in `docs/design/copy.md`):
   - Short, on Radar alerts: "Rule-based signals, not financial advice." / "Sinyal berbasis aturan, bukan nasihat keuangan."
   - Full, on Investments and every asset report: `inv.disclaimer`.
4. Banned phrases, checked by OR-33's guard (case-insensitive, whole words) on every generated text, and by the Reviewer on static copy:
   - EN: "should", "must", "we recommend", "you need to", "buy in" followed by a number and "parts" or "steps", "avoid", "avoided", "core of", "only a small", "your portfolio", "guaranteed", "will rise", "will fall", "target price"
   - ID: "sebaiknya", "harus", "kami sarankan", "Anda perlu", "hindari", "inti dari", "porsi kecil saja", "dijamin", "pasti naik", "pasti turun", "target harga"
5. Removed from the canvas: "Suggested approach: buy in 3 parts over 6 weeks rather than all at once" (Asset), "Small speculative share only" and "core of an emergency fund" (Investments risk cards, reworded in `copy.md` §7.1), "avoided −6.2%" (history).
6. Context, not a legal opinion: personalised investment advice in Indonesia is a licensed activity (OJK); this app gives impersonal, rule-based information for its single owner.

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

OR-29's unit tests must reproduce every verdict, SMA, RSI (to 0.01) and flip price in `expected.json`.
