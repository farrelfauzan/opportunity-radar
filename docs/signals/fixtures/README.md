# R-2 fixtures for signal rules v1 (OR-10)

Generated 2026-10-04 by `gen_fixtures.py` (exact integer/Fraction arithmetic, no floats in any comparison). `check.py` re-reads the CSVs with a separate float implementation and agrees on rows, SMA50, SMA200 and RSI14 to 0.01 for all 15 files (run from this folder: `python3 gen_fixtures.py . && python3 check.py`). QA should still recompute with their own script. Full expected values, including flip prices, are in `expected.json`.

Format: `date,close` (ISO date, close with 2 decimals), weekdays only, ending 2026-10-02. Prices are synthetic; no market data.

## Rules applied (the Designer's `rules-v1.md` wins if different)
- A row is one close. SMA50 = mean of the last 50 rows; SMA200 = mean of the last 200 rows.
- RSI14 = Wilder: first averages = simple mean of the first 14 changes (needs 15 closes); then avg = (previous × 13 + current) / 14. RSI = 100 × avgGain / (avgGain + avgLoss); both zero gives 50.
- Short term, needs ≥ 50 rows: RSI < 30 or RSI > 70 → HOLD; else close > SMA50 → BUY, close < SMA50 → SELL, equal → HOLD.
- Long term, needs ≥ 200 rows: SMA50 > SMA200 and close > SMA200 → BUY; SMA50 < SMA200 and close < SMA200 → SELL; else HOLD.
- Fewer rows than needed: INSUFFICIENT. Any close ≤ 0: INVALID_DATA. Several rows with one date: the last one wins. Gaps are not filled.

## Expected results (last row)
| file | rows | last close | SMA50 | SMA200 | RSI14 | short | long |
|---|---|---|---|---|---|---|---|
| rising_noisy.csv | 260 | 219.08 | 209.89 | 161.51 | 55.80 | BUY | BUY |
| falling_noisy.csv | 260 | 35.31 | 36.54 | 48.42 | 43.14 | SELL | SELL |
| flat.csv | 250 | 100.00 | 100.00 | 100.00 | 50.00 | HOLD | HOLD |
| all_gain.csv | 250 | 224.50 | 212.25 | 174.75 | 100.00 | HOLD | BUY |
| all_loss.csv | 250 | 175.50 | 187.75 | 225.25 | 0.00 | HOLD | SELL |
| len_14.csv | 14 | 105.24 | — | — | — | INSUFFICIENT | INSUFFICIENT |
| len_15.csv | 15 | 106.27 | — | — | 78.78 | INSUFFICIENT | INSUFFICIENT |
| len_49.csv | 49 | 121.73 | — | — | 77.82 | INSUFFICIENT | INSUFFICIENT |
| len_50.csv | 50 | 121.36 | 109.71 | — | 75.72 | HOLD | INSUFFICIENT |
| len_199.csv | 199 | 181.40 | 159.26 | — | 88.97 | HOLD | INSUFFICIENT |
| len_200.csv | 200 | 178.59 | 159.82 | 133.36 | 77.27 | HOLD | BUY |
| len_201.csv | 201 | 176.29 | 160.33 | 133.74 | 69.25 | BUY | BUY |
| gap.csv | 248 | 219.08 | 209.89 | 160.52 | 55.80 | BUY | BUY |
| duplicate_date.csv | 260 | 219.08 | 209.89 | 161.51 | 55.80 | BUY | BUY |
| nonpositive_close.csv | 260 | — | — | — | — | INVALID_DATA | INVALID_DATA |

Notes
- `len_*` are the first k rows of `rising_noisy`, so their last close differs. The RSI of a short, steadily rising series is high (len_15 gives 78.78), which is why several short-term verdicts there are HOLD (overbought), not BUY. This is the rule working as written.
- `gap.csv`: rows 120–131 of rising_noisy are removed (12 weekdays). SMA200 changes (160.52 vs 161.51) because 200 rows now reach 12 rows further back; SMA50 and RSI do not change at 2 decimals.
- `duplicate_date.csv`: for one date a bogus row (999.99) comes before the real row; the last row per date wins, so results equal `rising_noisy`.
- `nonpositive_close.csv`: a close of 0.00 at row 150 rejects the whole series.

## Flip prices (boundary tests for OR-29)
Meaning: replace the LAST close of the file by a hypothetical close x and keep every other row. "stays" = the highest (or lowest) x on the 0.01 grid that still gives the current verdict; the next 0.01 gives the new verdict. Searched down to 10% of the last close and up to 3× it; "none" means no change in that range.

| file | term | down from last close | up from last close |
|---|---|---|---|
| rising_noisy | short | 209.71 stays; 209.70 → SELL | 225.47 stays; 225.48 → HOLD |
| rising_noisy | long | 161.23 stays; 161.22 → HOLD | none |
| falling_noisy | short | 34.00 stays; 33.99 → HOLD | 36.56 stays; 36.57 → BUY |
| falling_noisy | long | none | 48.48 stays; 48.49 → HOLD |
| flat | short | none | none |
| flat | long | 100.00 stays; 99.99 → SELL | 100.00 stays; 100.01 → BUY |
| all_gain | short | 221.22 stays; 221.21 → BUY | none |
| all_gain | long | 174.51 stays; 174.50 → HOLD | none |
| all_loss | short | none | 178.78 stays; 178.79 → SELL |
| all_loss | long | none | 225.49 stays; 225.50 → HOLD |
| len_50 | short | 120.24 stays; 120.23 → BUY | none |
| len_199 | short | 175.31 stays; 175.30 → BUY | none |
| len_200 | short | 176.37 stays; 176.36 → BUY | none |
| len_200 | long | 133.14 stays; 133.13 → HOLD | none |
| len_201 | short | 160.01 stays; 160.00 → SELL | 176.52 stays; 176.53 → HOLD |
| len_201 | long | 133.54 stays; 133.53 → HOLD | none |
| gap | short | 209.71 stays; 209.70 → SELL | 225.47 stays; 225.48 → HOLD |
| gap | long | 160.23 stays; 160.22 → HOLD | none |
| duplicate_date | all | same as rising_noisy | same as rising_noisy |

len_14, len_15, len_49: no verdict, so no flip. Short-term flips between BUY/SELL happen at the mean of the previous 49 closes; RSI-driven flips (to or from HOLD) come from the Wilder update and have no simple closed form.

## Stale-input cases (rising_noisy.csv, last date 2026-10-02)
Stale = age in calendar days > limit. Stocks limit 7 (IDX Lebaran week: 10), metals limit 4, crypto limit 3.
| asset class | as-of date | age | expected |
|---|---|---|---|
| stock | 2026-10-09 | 7 | BUY / BUY |
| stock | 2026-10-10 | 8 | STALE, no verdict |
| metal | 2026-10-06 | 4 | BUY / BUY |
| metal | 2026-10-07 | 5 | STALE, no verdict |
| crypto | 2026-10-05 | 3 | BUY / BUY |
| crypto | 2026-10-06 | 4 | STALE, no verdict |
