"""Python protocol results for the JS parity test of analyzeTrend (PLAN.md L2).

    uv run python tests/make_trend_fixture.py
"""
import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import protocol as P  # noqa: E402

rng = np.random.default_rng(11)
N = 561
cases = []
for k in range(80):
    t = np.arange(N)
    v = 10 + 8 * np.cos(2 * np.pi * (t % 12 - 6.5) / 12) + rng.normal(0, 0.03) * t / 12
    e = rng.normal(0, rng.uniform(0.2, 1.5), N)
    for i in range(1, N):
        e[i] += rng.uniform(0, 0.7) * e[i - 1] if k % 2 else 0
    v = v + e
    if k % 5 == 0:
        v = np.round(v, 0)                     # ties
    if k % 7 == 0:
        v[rng.integers(0, N, 30)] = np.nan     # scattered gaps
    opts = {}
    if k % 4 == 1:
        opts = {"startYear": int(rng.integers(1980, 2000)), "endYear": int(rng.integers(2010, 2026))}
    seasons = [[6, 7, 8], [12, 1, 2], [3, 4, 5], [9, 10, 11]]
    if k % 6 == 3:
        opts["months"] = seasons[(k // 6) % 4]
    if k % 10 == 7:
        opts["months"] = [12, 1, 2]
    r = P.analyze(v, "1980-01", var="T2M",
                  start_year=opts.get("startYear", 1980), end_year=opts.get("endYear", 2025),
                  months=opts.get("months"))
    cases.append({
        "values": [None if np.isnan(x) else float(x) for x in v], "opts": opts,
        "status": r.status, "level": r.level, "slopePerDecade": r.slope_per_decade,
        "ci95": list(r.ci95), "pValue": r.p_value, "nYears": r.n_years, "years": r.years,
    })
out = Path(__file__).resolve().parents[2] / "web" / "src" / "__fixtures__" / "trend_parity.json"
def clean(o):
    if isinstance(o, float) and np.isnan(o):
        return None
    if isinstance(o, list):
        return [clean(x) for x in o]
    if isinstance(o, dict):
        return {k: clean(v) for k, v in o.items()}
    return o


out.write_text(json.dumps(clean(cases), allow_nan=False))
levels = {}
for c in cases:
    levels[c["level"]] = levels.get(c["level"], 0) + 1
print(f"wrote {len(cases)} cases, levels {levels}")
