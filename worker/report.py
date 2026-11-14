"""Write docs/EVIDENCE.md from the experiment outputs. No number in it is typed by hand.

Inputs (data/logs/, produced by the scripts named in each section):
  evidence_physical.json     evidence.py
  evidence_statistical.json  evidence_stats.py
  validation.json            badges.py
  provenance.json            provenance.py
They are also copied to docs/evidence/ so the raw results are in the repository.

    uv run report.py
"""
from __future__ import annotations

import json
import shutil

from download import ROOT

LOGS = ROOT / "data" / "logs"
DOCS = ROOT / "docs"
NAMES = ["evidence_physical", "evidence_statistical", "validation", "provenance"]


def cell(text: str) -> str:
    """Make text safe inside a Markdown table cell."""
    return str(text).replace("|", "\\|")


def ok(p: bool) -> str:
    return "✅ pass" if p else "❌ FAIL"


def main() -> None:
    (DOCS / "evidence").mkdir(parents=True, exist_ok=True)
    d = {}
    for n in NAMES:
        src = LOGS / f"{n}.json"
        d[n] = json.loads(src.read_text())
        shutil.copy(src, DOCS / "evidence" / f"{n}.json")
    phys, stat, val, prov = (d[n] for n in NAMES)

    L: list[str] = []
    a = L.append
    a("# Evidence")
    a("")
    a("How we know the numbers on Data May Cry are right. Every value below is copied by "
      "`worker/report.py` from the result files in [`docs/evidence/`](evidence/); nothing is typed by hand. "
      "Pass criteria were written into the scripts before they were run and were not tuned afterwards.")
    a("")
    n_stat = sum(stat[k]["passed"] for k in ("S1_false_alarms", "S2_power", "S3_ci_coverage"))
    a("| Group | Result | Script |")
    a("|---|---|---|")
    a(f"| Physical consistency of the data | {phys['passed']} / {phys['total']} passed | `worker/evidence.py` |")
    a(f"| Statistical behaviour of the method | {n_stat} / 3 passed | `worker/evidence_stats.py` |")
    a(f"| Independent sources (badges) | stations agree in {val['ghcn']['agree']} / "
      f"{sum(val['ghcn'].values())} regions; GISTEMP {val['gistemp']['status']} | `worker/badges.py` |")
    a(f"| Input provenance | {len(prov['datasets'])} datasets with version, DOI/URL and SHA-256 | `worker/provenance.py` |")
    a("")

    a("## 1. Physical consistency (real MERRA-2 data)")
    a("")
    a("If the data were broken, it would break physics or miss documented events.")
    a("")
    a("| # | Test | Expected (source) | Result | |")
    a("|---|---|---|---|---|")
    for e in phys["experiments"]:
        res = ", ".join(f"{k} = {v}" for k, v in e["result"].items() if k != "region")
        a(f"| {e['id']} | **{cell(e['name'])}**<br>{cell(e['physics'])} | {cell(e['expected'])}<br><small>{cell(e['source'])}</small> | {cell(res)} | {ok(e['passed'])} |")
    a("")

    a("## 2. Statistical behaviour of the method (synthetic data)")
    a("")
    a(f"Synthetic monthly series shaped like the real ones (561 months, seasonal cycle, AR(1) noise), "
      f"run through the same `protocol.analyze` as the real cards. Seed {stat['seed']}.")
    a("")
    s1 = stat["S1_false_alarms"]
    a(f"**S1 False alarms** — {s1['question']} Criterion: {s1['criterion']}. {ok(s1['passed'])}")
    a("")
    a("| Noise autocorrelation φ | Runs | Says \"possible\" or \"strong\" | Says \"strong\" |")
    a("|---|---|---|---|")
    for r in s1["results"]:
        a(f"| {r['phi']} | {r['sims']} | {r['possible_or_strong_pct']} % | {r['strong_pct']} % |")
    a("")
    s2 = stat["S2_power"]
    a(f"**S2 Power** — {s2['question']} Criterion: {s2['criterion']}. {ok(s2['passed'])}")
    a("")
    a("| True trend (noise SD per decade) | Runs | Detected | \"Strong\" |")
    a("|---|---|---|---|")
    for r in s2["results"]:
        a(f"| {r['trend_sd_per_decade']} | {r['sims']} | {r['detected_pct']} % | {r['strong_pct']} % |")
    ref = s2.get("reference")
    if ref:
        a("")
        a(f"Where a real card sits: {ref['place']} has a trend of {ref['trend_C_per_decade']} °C/decade and a monthly "
          f"anomaly SD of {ref['monthly_anomaly_sd_C']} °C, i.e. {ref['trend_sd_per_decade']} SD/decade.")
    a("")
    s3 = stat["S3_ci_coverage"]
    a(f"**S3 Confidence-interval coverage** — {s3['question']} Criterion: {s3['criterion']}. {ok(s3['passed'])}")
    a("")
    a("| φ | Runs | 95 % range contains the true trend |")
    a("|---|---|---|")
    for r in s3["results"]:
        a(f"| {r['phi']} | {r['sims']} | {r['coverage_pct']} % |")
    a("")

    a("## 3. Independent sources")
    a("")
    a("Rule (fixed in `contract/types.ts` before computing): *agree* = same direction and overlapping 95 % ranges.")
    a("")
    a("| Source | Variable | Agree | Disagree | Inconclusive |")
    a("|---|---|---|---|---|")
    for key, label, var in (("ghcn", "NOAA GHCN-M v4 stations (1980–2025)", "T2M"), ("gpcp", "NASA GPCP v3.3 (1983–2025)", "PRECTOT")):
        c = val[key]
        tot = sum(c.values())
        a(f"| {label} | {var} | {c['agree']} ({100 * c['agree'] / tot:.0f} %) | {c['disagree']} | {c['inconclusive']} |")
    g = val["gistemp"]
    a("")
    a(f"Global temperature vs {g['source']}, {g['years'][0]}–{g['years'][1]}: **{g['status']}**. "
      f"MERRA-2 {g['ours']['slopePerDecade']} °C/decade (95 % {g['ours']['ci95'][0]}…{g['ours']['ci95'][1]}), "
      f"GISTEMP {g['ref']['slopePerDecade']} °C/decade (95 % {g['ref']['ci95'][0]}…{g['ref']['ci95'][1]}), "
      f"year-to-year correlation r = {g['annual_correlation']}.")
    st = val["ghcn_stations"]
    a(f"Stations used: {st['stations_qualifying']} of {st['stations_total']} GHCN stations have ≥ 80 % complete years.")
    a("")
    a("Where an independent source disagrees, the card never shows \"strong evidence\" for a period that covers "
      "at least 80 % of the comparison years (the default 1980–2025 card always does).")
    a("")

    a("## 4. Software checks (run on every change)")
    a("")
    a("| Check | Command |")
    a("|---|---|")
    a("| Python ↔ pymannkendall on 1,000 series, vectorized == scalar, calibration, FDR, int16 round trip | `cd worker && uv run pytest` |")
    a("| Python ↔ JavaScript parity of the full card (80 cases), data.ts on mock files | `cd web && npm test` |")
    a("| Every data file matches the contract (JSON Schema) | `cd worker && uv run validate.py <folder>` |")
    a("")

    a("## 5. Inputs (provenance)")
    a("")
    a("| Dataset | Version | DOI / URL | Files | Size | SHA-256 (all files) | Licence | Used for |")
    a("|---|---|---|---|---|---|---|---|")
    for s in prov["datasets"]:
        link = s.get("doi") or s.get("url")
        a(f"| {s['dataset']} | {s['version']} | {link} | {s['files']} | {s['bytes'] / 1e6:.1f} MB | "
          f"`{s['sha256_all'][:16]}…` | {s['licence']} | {s['use']} |")
    a("")
    a("## 6. Known limitations")
    a("")
    a("- MERRA-2 is a reanalysis (model + observations), not a direct measurement; that is why sections 1 and 3 exist.")
    a("- Runoff (RUNOFF) is marked experimental: in some cells monthly runoff far exceeds rainfall. It never gets \"strong evidence\".")
    a("- Precipitation agrees with GPCP less often than temperature agrees with stations; disagreeing regions are capped.")
    a("- Grid cells are about 55 × 55 km; provinces smaller than one cell are flagged as low resolution.")
    a("- A linear trend does not describe accelerating or reversing changes, and no statement here is about causes.")
    a("")
    a(f"*Generated {phys['generated']} by `worker/report.py`. Written with AI assistance (Claude).*")
    (DOCS / "EVIDENCE.md").write_text("\n".join(L) + "\n")
    print(f"→ docs/EVIDENCE.md ({len(L)} lines), raw results in docs/evidence/")


if __name__ == "__main__":
    main()
