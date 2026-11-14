"""Which MERRA-2 precipitation agrees with independent observations?

PRECTOT (model) and PRECTOTCORR (bias-corrected over land) vs NASA GPCP v3.3
(satellite + gauge), same period 1983–2025, annual means per region:
  - Sen's slope per decade + Mann-Kendall p for each source
  - correlation of annual values with GPCP (do the year-to-year ups and downs match?)

    uv run compare_precip.py
"""
from __future__ import annotations

import glob
import json

import numpy as np
import pymannkendall as mk
import xarray as xr

from download import RAW, ROOT

Y0, Y1 = 1983, 2025

# name, lat min, lat max, lon min, lon max
REGIONS = [
    ("Amazon basin", -10, 0, -70, -50),
    ("SE Turkey (Diyarbakir)", 36.5, 39.5, 38, 43),
    ("Central Anatolia (Konya)", 37, 40, 31, 35),
    ("Turkey", 36, 42, 26, 45),
    ("Sahel", 10, 18, -15, 30),
    ("India (monsoon)", 15, 28, 72, 88),
    ("Europe", 45, 55, 0, 20),
    ("Eastern US", 30, 45, -90, -75),
    ("Tropical Pacific (ocean)", -5, 5, -170, -120),
    ("Global", -90, 90, -180, 180),
]


def load(pattern: str, fields: list[str]) -> xr.Dataset:
    parts = []
    for f in sorted(glob.glob(pattern)):
        y = int(f.split("/")[-1][:4])
        if Y0 <= y <= Y1:
            with xr.open_dataset(f) as one:
                parts.append(one[fields].load())
    return xr.concat(parts, dim="time")


def annual_box(da: xr.DataArray, la0, la1, lo0, lo1) -> np.ndarray:
    lat = da.lat
    box = da.where((lat >= la0) & (lat <= la1) & (da.lon >= lo0) & (da.lon <= lo1), drop=True)
    w = np.cos(np.radians(box.lat))
    s = box.weighted(w).mean(("lat", "lon"))
    return s.groupby("time.year").mean().values


merra = load(str(RAW / "M2TMNXFLX" / "*.nc4"), ["PRECTOT", "PRECTOTCORR"]) * 86400
gpcp = load(str(RAW / "GPCPMON" / "*.nc4"), ["sat_gauge_precip"])["sat_gauge_precip"]

rows = []
print(f"{Y0}–{Y1}, annual means. trend = Sen's slope mm/day per decade; r = correlation with GPCP\n")
print(f"{'region':26s} {'source':12s} {'mean':>6s} {'trend':>8s} {'p':>7s} {'r':>6s}")
for name, *box in REGIONS:
    ref = annual_box(gpcp, *box)
    for label, series in (("GPCP", ref),
                          ("PRECTOT", annual_box(merra.PRECTOT, *box)),
                          ("PRECTOTCORR", annual_box(merra.PRECTOTCORR, *box))):
        t = mk.original_test(series)
        r = float(np.corrcoef(series, ref)[0, 1])
        rows.append({"region": name, "source": label, "mean": float(series.mean()),
                     "trend_per_decade": float(t.slope * 10), "p": float(t.p), "r_vs_gpcp": r})
        print(f"{name:26s} {label:12s} {series.mean():6.2f} {t.slope * 10:+8.3f} {t.p:7.4f} {r:6.2f}")
    print()

# Summary: which MERRA field is closer to GPCP?
for field in ("PRECTOT", "PRECTOTCORR"):
    same_sign = sum(
        1 for name, *_ in REGIONS
        if np.sign(next(x for x in rows if x["region"] == name and x["source"] == field)["trend_per_decade"])
        == np.sign(next(x for x in rows if x["region"] == name and x["source"] == "GPCP")["trend_per_decade"])
    )
    r_mean = np.mean([x["r_vs_gpcp"] for x in rows if x["source"] == field])
    err = np.mean([abs(x["trend_per_decade"] - next(g for g in rows if g["region"] == x["region"]
                                                   and g["source"] == "GPCP")["trend_per_decade"])
                   for x in rows if x["source"] == field])
    print(f"{field:12s} trend sign = GPCP in {same_sign}/{len(REGIONS)} regions, "
          f"mean |trend − GPCP| {err:.3f} mm/day/decade, mean r {r_mean:.2f}")

(ROOT / "data" / "logs" / "compare_precip.json").write_text(json.dumps(rows, indent=2))
