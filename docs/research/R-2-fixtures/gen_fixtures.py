#!/usr/bin/env python3
"""Generates signal-rule fixtures (CSV) and expected values for OR-10 rules v1.
Exact arithmetic (integers = cents, fractions.Fraction); no floats in any comparison.
Usage: python3 gen_fixtures.py <outdir>
"""
import csv, json, math, os, random, sys
from datetime import date, timedelta
from fractions import Fraction as F
from decimal import Decimal, ROUND_HALF_UP

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)
END = date(2026, 10, 2)  # a Friday


def weekdays_back(n, end=END):
    d, out = end, []
    while len(out) < n:
        if d.weekday() < 5:
            out.append(d)
        d -= timedelta(days=1)
    return out[::-1]


def r2(fr):  # exact Fraction -> 2-dp string, half up
    return str((Decimal(fr.numerator) / Decimal(fr.denominator)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


# ---------- rules v1 (exact) ----------
def wilder_state(cents):
    """returns (avgGain, avgLoss) as Fractions after the last close, or None if < 15 closes."""
    if len(cents) < 15:
        return None
    ch = [cents[i] - cents[i - 1] for i in range(1, len(cents))]
    g = F(sum(c for c in ch[:14] if c > 0), 14)
    l = F(sum(-c for c in ch[:14] if c < 0), 14)
    for c in ch[14:]:
        g = (g * 13 + max(c, 0)) / 14
        l = (l * 13 + max(-c, 0)) / 14
    return g, l


def rsi_from(g, l):
    return F(50) if g + l == 0 else 100 * g / (g + l)


def verdicts_from(close, sma50, sma200, rsi, n):
    """close/sma/rsi are Fractions (cents for prices). n = number of rows."""
    if n < 50:
        short = "INSUFFICIENT"
    elif rsi < 30 or rsi > 70:
        short = "HOLD"
    elif close > sma50:
        short = "BUY"
    elif close < sma50:
        short = "SELL"
    else:
        short = "HOLD"
    if n < 200:
        long_ = "INSUFFICIENT"
    elif sma50 > sma200 and close > sma200:
        long_ = "BUY"
    elif sma50 < sma200 and close < sma200:
        long_ = "SELL"
    else:
        long_ = "HOLD"
    return short, long_


def evaluate(cents):
    n = len(cents)
    c = F(cents[-1])
    sma50 = F(sum(cents[-50:]), 50) if n >= 50 else None
    sma200 = F(sum(cents[-200:]), 200) if n >= 200 else None
    st = wilder_state(cents)
    rsi = rsi_from(*st) if st else None
    short, long_ = verdicts_from(c, sma50, sma200, rsi, n)
    return dict(n=n, close=c, sma50=sma50, sma200=sma200, rsi=rsi, short=short, long=long_)


def flips(cents):
    """Replace the LAST close by hypothetical x (cents). For each term find the nearest x below and above
    the actual last close where the verdict changes. Returns {term: {'down': (old_x, new_x, new_verdict)|None, 'up': ...}}"""
    n = len(cents)
    base = evaluate(cents)
    pre = cents[:-1]
    st_prev = wilder_state(pre) if len(pre) >= 15 else None
    s49 = sum(pre[-49:]) if n >= 50 else None
    s199 = sum(pre[-199:]) if n >= 200 else None
    prev = pre[-1]

    def ev(x):
        sma50 = F(s49 + x, 50) if s49 is not None else None
        sma200 = F(s199 + x, 200) if s199 is not None else None
        if st_prev:
            g, l = st_prev
            d = x - prev
            g = (g * 13 + max(d, 0)) / 14
            l = (l * 13 + max(-d, 0)) / 14
            rsi = rsi_from(g, l)
        else:
            rsi = None
        return verdicts_from(F(x), sma50, sma200, rsi, n)

    assert ev(cents[-1]) == (base["short"], base["long"]), "flip evaluator disagrees with evaluate()"
    res = {}
    for idx, term in enumerate(("short", "long")):
        old = base[term]
        res[term] = {"down": None, "up": None}
        if old == "INSUFFICIENT":
            continue
        last = cents[-1]
        # down
        x = last
        lim = max(1, last // 10)
        while x > lim:
            x -= 1
            v = ev(x)[idx]
            if v != old:
                res[term]["down"] = (x + 1, x, v)
                break
        x = last
        lim = last * 3
        while x < lim:
            x += 1
            v = ev(x)[idx]
            if v != old:
                res[term]["up"] = (x - 1, x, v)
                break
    return res


# ---------- series generators ----------
def noisy(seed, n, drift, vol, start=100.0):
    rnd = random.Random(seed)
    p, out = start, []
    for _ in range(n):
        p *= math.exp(drift + rnd.gauss(0, vol))
        out.append(int(round(p * 100)))
    return out


def pick(n, drift, vol, want):
    for seed in range(1, 5000):
        s = noisy(seed, n, drift, vol)
        e = evaluate(s)
        if want(e) and min(s) > 0:
            return seed, s
    raise SystemExit("no seed found")


def margin(e):  # closes comfortably away from SMA50/200 (>=1.5%)
    return abs(e["close"] / e["sma50"] - 1) > F(15, 1000) and abs(e["close"] / e["sma200"] - 1) > F(15, 1000)


seed_up, rising = pick(260, 0.0030, 0.011, lambda e: e["short"] == "BUY" and e["long"] == "BUY" and 40 <= e["rsi"] <= 60 and margin(e))
seed_dn, falling = pick(260, -0.0030, 0.011, lambda e: e["short"] == "SELL" and e["long"] == "SELL" and 40 <= e["rsi"] <= 60 and margin(e))
flat = [10000] * 250
all_gain = [10000 + 50 * i for i in range(250)]            # +0.50 every row
all_loss = [30000 - 50 * i for i in range(250)]            # -0.50 every row, ends 175.50

fixtures = []  # (name, cents list, dates list, note)


def add(name, cents, note, dates=None, raw_rows=None):
    dates = dates or weekdays_back(len(cents))
    fixtures.append(dict(name=name, cents=cents, dates=dates, note=note, raw_rows=raw_rows))


add("rising_noisy", rising, f"noisy uptrend, 260 rows (seed {seed_up}); RSI mid so short-term is BUY, not HOLD")
add("falling_noisy", falling, f"noisy downtrend, 260 rows (seed {seed_dn}); RSI mid so short-term is SELL")
add("flat", flat, "constant 100.00, 250 rows: RSI=50 by the flat rule, every average equal, HOLD/HOLD")
add("all_gain", all_gain, "+0.50 every row, 250 rows: avgLoss=0 so RSI=100; short HOLD (overbought), long BUY")
add("all_loss", all_loss, "-0.50 every row, 250 rows: avgGain=0 so RSI=0; short HOLD (oversold), long SELL")
for k in (14, 15, 49, 50, 199, 200, 201):
    add(f"len_{k}", rising[:k], f"first {k} rows of rising_noisy (history-length boundary)")

# gap: remove 12 consecutive weekdays in the middle; rows are counted, nothing is filled
alld = weekdays_back(260)
keep = list(range(0, 120)) + list(range(132, 260))
add("gap", [rising[i] for i in keep], "rising_noisy minus 12 consecutive weekdays (rows 120-131); 248 rows; gaps are NOT filled", dates=[alld[i] for i in keep])

# duplicate date: row 100 appears twice, first copy is bogus (999.99); the LAST copy per date wins -> same as rising_noisy
dups = []
for i, (d, c) in enumerate(zip(alld, rising)):
    if i == 100:
        dups.append((d, 99999))
    dups.append((d, c))
fixtures.append(dict(name="duplicate_date", cents=rising, dates=alld, note="rising_noisy with a bogus extra row for one date placed BEFORE the real row; keep the last row per date, so results equal rising_noisy", raw_rows=dups))

# non-positive close
bad = list(rising)
bad[150] = 0
fixtures.append(dict(name="nonpositive_close", cents=bad, dates=alld, note="rising_noisy with close 0.00 at row 150: whole series rejected as INVALID_DATA", raw_rows=None))

# ---------- write ----------
expected = {}
for f in fixtures:
    rows = f["raw_rows"] or list(zip(f["dates"], f["cents"]))
    with open(os.path.join(OUT, f["name"] + ".csv"), "w", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["date", "close"])
        for d, c in rows:
            w.writerow([d.isoformat(), f"{c/100:.2f}"])
    cents = f["cents"]
    if f["name"] == "nonpositive_close":
        expected[f["name"]] = dict(note=f["note"], rows=len(cents), short="INVALID_DATA", long="INVALID_DATA")
        continue
    e = evaluate(cents)
    fl = flips(cents)
    ex = dict(note=f["note"], rows=e["n"], last_date=f["dates"][-1].isoformat(), last_close=r2(e["close"] / 100),
              sma50=r2(e["sma50"] / 100) if e["sma50"] is not None else None,
              sma200=r2(e["sma200"] / 100) if e["sma200"] is not None else None,
              rsi14=r2(e["rsi"]) if e["rsi"] is not None else None,
              short=e["short"], long=e["long"], flips={})
    for term in ("short", "long"):
        d = {}
        for dr in ("down", "up"):
            t = fl[term][dr]
            d[dr] = None if t is None else dict(still_old_verdict_at=f"{t[0]/100:.2f}", becomes=t[2], at=f"{t[1]/100:.2f}")
        ex["flips"][term] = d
    expected[f["name"]] = ex

# stale cases (as_of vs last_date): stale if age in calendar days > limit (stock 7, crypto/metal 3)
last = END
cases = []
for cls, lim in (("stock", 7), ("crypto_or_metal", 3)):
    for age, res in ((lim, "verdict"), (lim + 1, "STALE")):
        cases.append(dict(file="rising_noisy.csv", asset_class=cls, as_of=(last + timedelta(days=age)).isoformat(), age_days=age, expected=("BUY/BUY" if res == "verdict" else "STALE (no verdict)")))
json.dump(dict(rules="rules v1", as_of_default="last_date of each file", fixtures=expected, stale_cases=cases), open(os.path.join(OUT, "expected.json"), "w"), indent=2)
print(json.dumps(expected, indent=1)[:6000])
