"""Full check of the downloaded MERRA-2 files before anything is computed from them.

Goes beyond the per-file L0 checks done while downloading:
  1. Completeness: every collection has every month 1980-01 → last, no gaps.
  2. Manifest: SHA-256 of every file matches what was recorded at download.
  3. Every file: coordinates exact, time = file month, float32, variables present.
  4. Land mask: ocean NaN pattern identical across months and land variables.
  5. Stale data: no month identical to the previous one.
  6. Global area-weighted monthly means: outliers (|z| > 5 on anomalies), seasonal cycle.
  7. Spot checks at known places (Diyarbakır, Sahara, Arctic, Amazon, ...).
  8. Granule streams (MERRA2_100/200/300/400/401) per month, for the Methods page.

    uv run check_raw.py          # writes data/logs/check_raw.json and prints a report
"""
from __future__ import annotations

import hashlib
import json
import re
from collections import Counter
from pathlib import Path

import numpy as np
import xarray as xr

from download import COLLECTIONS, LAND_VARS, RANGES, RAW, ROOT

LAT = np.arange(361) * 0.5 - 90
LON = np.arange(576) * 0.625 - 180
W = np.cos(np.radians(LAT))[:, None] * np.ones((1, 576))

# name, lat, lon
PLACES = [
    ("Diyarbakir", 37.9, 40.2),
    ("Konya", 37.9, 32.5),
    ("Sahara (Algeria)", 25.0, 5.0),
    ("Arctic (Svalbard)", 78.0, 15.0),
    ("Amazon (Manaus)", -3.1, -60.0),
    ("Greenland summit", 72.5, -38.5),
    ("Beijing", 39.9, 116.4),
    ("Pacific (open ocean)", 0.0, -150.0),
]


def months_expected(first: str, last: str) -> list[str]:
    y, m = int(first[:4]), int(first[4:])
    out = []
    while f"{y}{m:02d}" <= last:
        out.append(f"{y}{m:02d}")
        m += 1
        if m == 13:
            y, m = y + 1, 1
    return out


def idx(lat: float, lon: float) -> tuple[int, int]:
    return int(round((lat + 90) / 0.5)), int(round((lon + 180) / 0.625)) % 576


def main() -> None:
    report: dict = {"problems": [], "collections": {}, "variables": {}, "places": {}}
    problems = report["problems"]

    # 2. manifest
    manifest = {}
    for line in (RAW / "manifest.jsonl").read_text().splitlines():
        r = json.loads(line)
        manifest[r["file"]] = r
    report["manifest_entries"] = len(manifest)

    all_months: set[str] = set()
    for coll in COLLECTIONS:
        all_months |= {p.stem for p in (RAW / coll).glob("*.nc4")}
    expected = months_expected("198001", max(all_months))

    globals_: dict[str, list[float]] = {}
    place_series: dict[str, dict[str, list[float]]] = {p[0]: {} for p in PLACES}
    land_mask_ref: np.ndarray | None = None

    for coll, variables in COLLECTIONS.items():
        files = sorted((RAW / coll).glob("*.nc4"))
        months = [f.stem for f in files]
        missing = sorted(set(expected) - set(months))
        if missing:
            problems.append(f"{coll}: missing months {missing[:10]}{'...' if len(missing) > 10 else ''}")
        streams: Counter = Counter()
        prev: dict[str, np.ndarray] = {}
        sha_bad = 0
        for f in files:
            rel = str(f.relative_to(ROOT))
            m = manifest.get(rel)
            if m is None:
                problems.append(f"{rel}: not in manifest")
            elif hashlib.sha256(f.read_bytes()).hexdigest() != m["sha256"]:
                sha_bad += 1
                problems.append(f"{rel}: SHA-256 mismatch")
            if m:
                s = re.search(r"MERRA2_(\d{3})", m["granule"])
                streams[s.group(1) if s else "?"] += 1

            with xr.open_dataset(f) as ds:
                if not (np.allclose(ds.lat.values, LAT) and np.allclose(ds.lon.values, LON)):
                    problems.append(f"{rel}: coordinates differ from the MERRA-2 grid")
                t = np.datetime_as_string(ds.time.values[0], unit="M").replace("-", "")
                if t != f.stem:
                    problems.append(f"{rel}: time {t} != file month {f.stem}")
                for v in variables:
                    a = ds[v].values[0]
                    if ds[v].dtype != np.float32:
                        problems.append(f"{rel}: {v} dtype {ds[v].dtype}")
                    nan = np.isnan(a)
                    if v in LAND_VARS:
                        if land_mask_ref is None:
                            land_mask_ref = nan
                        elif not np.array_equal(nan, land_mask_ref):
                            diff = int((nan != land_mask_ref).sum())
                            problems.append(f"{rel}: {v} land mask differs in {diff} cells")
                    if v in prev and np.array_equal(a, prev[v], equal_nan=True):
                        problems.append(f"{rel}: {v} identical to previous month")
                    prev[v] = a
                    ok = ~nan
                    globals_.setdefault(v, []).append(float((a[ok] * W[ok]).sum() / W[ok].sum()))
                    for name, la, lo in PLACES:
                        i, j = idx(la, lo)
                        place_series[name].setdefault(v, []).append(float(a[i, j]))
        report["collections"][coll] = {
            "files": len(files), "first": months[0], "last": months[-1],
            "missing": len(missing), "sha_mismatch": sha_bad, "streams": dict(sorted(streams.items())),
        }

    # 6. global means: seasonal cycle, outliers, trend
    n = len(expected)
    years = np.array([int(mm[:4]) for mm in expected])
    for v, g in globals_.items():
        g = np.array(g)
        cal = np.array([int(mm[4:]) for mm in expected])
        clim = np.array([g[cal == k].mean() for k in range(1, 13)])
        anom = g - clim[cal - 1]
        z = (anom - anom.mean()) / anom.std()
        outliers = [expected[k] for k in np.where(np.abs(z) > 5)[0]]
        if outliers:
            problems.append(f"{v}: global-mean outliers |z|>5 in {outliers}")
        full = years <= 2025
        ann_years = np.arange(1980, 2026)
        ann = np.array([anom[(years == y)].mean() for y in ann_years])
        slope = np.polyfit(ann_years, ann, 1)[0] * 10
        lo, hi = RANGES[v]
        report["variables"][v] = {
            "global_mean": float(g.mean()), "seasonal_amplitude": float(clim.max() - clim.min()),
            "min_month": expected[int(g.argmin())], "max_month": expected[int(g.argmax())],
            "ols_trend_per_decade_1980_2025": float(slope), "outliers": outliers,
            "months": int(full.sum()),
        }
    report["months_expected"] = n

    # 7. spot checks (display units for the report)
    conv = {"T2M": (1, -273.15), "QV2M": (1000, 0), "PRECTOT": (86400, 0), "EVAP": (86400, 0),
            "RUNOFF": (86400, 0), "GWETROOT": (100, 0)}
    for name, series in place_series.items():
        out = {}
        for v, s in series.items():
            s = np.array(s)
            mul, add = conv.get(v, (1, 0))
            d = s * mul + add
            out[v] = None if np.isnan(d).all() else {
                "mean": round(float(np.nanmean(d)), 4), "min": round(float(np.nanmin(d)), 4),
                "max": round(float(np.nanmax(d)), 4),
                "first10y_mean": round(float(np.nanmean(d[:120])), 4),
                "last10y_mean": round(float(np.nanmean(d[-129:-9])), 4),  # 2016-2025
            }
        report["places"][name] = out

    out = ROOT / "data" / "logs" / "check_raw.json"
    out.write_text(json.dumps(report, indent=2))

    print(f"Months expected: {n} (198001 → {expected[-1]}), manifest entries: {report['manifest_entries']}")
    for c, r in report["collections"].items():
        print(f"  {c}: {r['files']} files {r['first']}→{r['last']}, missing {r['missing']}, "
              f"sha mismatch {r['sha_mismatch']}, streams {r['streams']}")
    print("\nGlobal area-weighted means (raw units):")
    for v, r in report["variables"].items():
        print(f"  {v:9s} mean {r['global_mean']:.6g}  seasonal amp {r['seasonal_amplitude']:.4g}  "
              f"trend/decade {r['ols_trend_per_decade_1980_2025']:+.4g}  outliers {r['outliers'] or '-'}")
    print(f"\nProblems: {len(problems)}")
    for p in problems[:40]:
        print("  -", p)
    print(f"\nFull report: {out.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
