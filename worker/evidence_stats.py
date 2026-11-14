"""Statistical experiments on the decision protocol (synthetic data, fixed seed).

Criteria written before running (2026-11-14), not tuned afterwards.

  S1 False alarms     trend-free AR(1) monthly noise: how often do we say "possible"/"strong"?
  S2 Power            how often a real trend of a given size is detected (46 years)
  S3 CI coverage      how often the 95 % CI contains the true trend

Series look like real data: 561 months from 1980-01, seasonal cycle, AR(1) noise,
the same `protocol.analyze` used for the real cards.

    uv run evidence_stats.py   → data/logs/evidence_statistical.json
"""
from __future__ import annotations

import json
from datetime import date

import numpy as np

import protocol as P
from download import ROOT

OUT = ROOT / "data" / "logs" / "evidence_statistical.json"
N = 561
START = "1980-01"
SEED = 20261114


def ar1(rng, phi: float, n: int = N) -> np.ndarray:
    e = rng.normal(0, 1, n)
    x = np.zeros(n)
    for k in range(1, n):
        x[k] = phi * x[k - 1] + e[k]
    return x * np.sqrt(1 - phi ** 2)  # unit variance whatever phi is


def series(rng, phi: float, trend_per_decade: float) -> np.ndarray:
    t = np.arange(N)
    season = 8 * np.cos(2 * np.pi * (t % 12 - 6.5) / 12)
    return 10 + season + trend_per_decade * t / 120 + ar1(rng, phi)


def diyarbakir_reference() -> dict | None:
    """Where a real card sits on the power curve: Diyarbakır T2M from the real package."""
    f = ROOT / "data" / "package" / "regions" / "TUR.bin"
    if not f.exists():
        return None
    from dmc import read_dmc
    h, d = read_dmc(f)
    ids = [r["id"] for r in h["regions"]]
    k, m, nv = ids.index("TR-21"), h["months"], len(h["vars"])
    v = h["vars"].index("T2M")
    raw = d[(k * nv + v) * m:(k * nv + v + 1) * m]
    x = raw * h["packing"][v]["scale"] + h["packing"][v]["offset"]
    sd = float(np.nanstd(P.anomalies(x.astype(float), START)[:552]))
    slope = P.analyze(x.astype(float), START).slope_per_decade
    return {"place": "Diyarbakır (TR-21), T2M", "trend_C_per_decade": round(slope, 3),
            "monthly_anomaly_sd_C": round(sd, 3), "trend_sd_per_decade": round(slope / sd, 3)}


def main() -> None:
    rng = np.random.default_rng(SEED)
    out: dict = {"generated": date.today().isoformat(), "seed": SEED, "criteria_fixed_before_run": True}

    # S1 false alarms
    s1 = []
    for phi in (0.0, 0.3, 0.6):
        sims = 2000
        lv = [P.analyze(series(rng, phi, 0.0), START).level for _ in range(sims)]
        s1.append({"phi": phi, "sims": sims,
                   "possible_or_strong_pct": round(100 * sum(x != "none" for x in lv) / sims, 2),
                   "strong_pct": round(100 * sum(x == "strong" for x in lv) / sims, 2)})
    out["S1_false_alarms"] = {
        "question": "With no trend at all, how often does the card claim one?",
        "criterion": "possible-or-strong ≤ 7 % and strong ≤ 0.5 % for every phi",
        "results": s1,
        "passed": all(r["possible_or_strong_pct"] <= 7 and r["strong_pct"] <= 0.5 for r in s1),
    }

    # S2 power (trend in units of the monthly noise SD per decade; phi = 0.3)
    s2 = []
    for size in (0.0, 0.05, 0.1, 0.15, 0.2, 0.3, 0.5):
        sims = 600
        lv = [P.analyze(series(rng, 0.3, size), START).level for _ in range(sims)]
        s2.append({"trend_sd_per_decade": size, "sims": sims,
                   "detected_pct": round(100 * sum(x != "none" for x in lv) / sims, 1),
                   "strong_pct": round(100 * sum(x == "strong" for x in lv) / sims, 1)})
    out["S2_power"] = {
        "question": "If a real trend exists, how often do we detect it? (46 years, phi = 0.3)",
        "reference": diyarbakir_reference(),
        "criterion": "a 0.3 SD/decade trend is detected in ≥ 90 % of runs",
        "results": s2,
        "passed": next(r for r in s2 if r["trend_sd_per_decade"] == 0.3)["detected_pct"] >= 90,
    }

    # S3 CI coverage
    s3 = []
    for phi in (0.3, 0.6):
        sims, hit = 1000, 0
        for _ in range(sims):
            r = P.analyze(series(rng, phi, 0.2), START)
            hit += r.ci95[0] <= 0.2 <= r.ci95[1]
        s3.append({"phi": phi, "sims": sims, "coverage_pct": round(100 * hit / sims, 1)})
    out["S3_ci_coverage"] = {
        "question": "Does the 95 % range contain the true trend about 95 % of the time?",
        "criterion": "coverage ≥ 90 % (PLAN §3.7-2b measured ~93 %)",
        "results": s3,
        "passed": all(r["coverage_pct"] >= 90 for r in s3),
    }

    OUT.write_text(json.dumps(out, indent=2))
    for k in ("S1_false_alarms", "S2_power", "S3_ci_coverage"):
        print(f"{k}: {'PASS' if out[k]['passed'] else 'FAIL'}  {out[k]['results']}")
    print(f"→ {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
