# second, float-based implementation reading the CSVs back (checks the generator, not shares its code)
import csv, json, glob, os
exp = json.load(open("expected.json"))["fixtures"]
bad = 0
for path in sorted(glob.glob("*.csv")):
    name = os.path.basename(path)[:-4]
    by = {}
    for r in csv.DictReader(open(path)):
        by[r["date"]] = float(r["close"])          # last row per date wins
    dates = sorted(by); c = [by[d] for d in dates]
    e = exp[name]
    if min(c) <= 0:
        assert e["short"] == "INVALID_DATA"; print(name, "INVALID_DATA ok"); continue
    n = len(c)
    sma = lambda k: sum(c[-k:]) / k if n >= k else None
    rsi = None
    if n >= 15:
        d = [c[i] - c[i-1] for i in range(1, n)]
        g = sum(x for x in d[:14] if x > 0) / 14; l = sum(-x for x in d[:14] if x < 0) / 14
        for x in d[14:]:
            g = (g*13 + max(x, 0))/14; l = (l*13 + max(-x, 0))/14
        rsi = 50.0 if g + l < 1e-12 else (100.0 if l < 1e-12 else 100 - 100/(1 + g/l))
    got = dict(rows=n, sma50=sma(50), sma200=sma(200), rsi=rsi)
    ok = e["rows"] == n
    for k, ek in (("sma50", "sma50"), ("sma200", "sma200"), ("rsi", "rsi14")):
        if got[k] is None: ok &= e[ek] is None
        else: ok &= abs(got[k] - float(e[ek])) < 0.0051
    print(name, "ok" if ok else "MISMATCH", got["rows"], None if rsi is None else round(rsi, 2), e["rsi14"], e["short"], e["long"])
    bad += not ok
print("mismatches:", bad)
