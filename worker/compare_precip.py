"""PRECTOT (model) vs PRECTOTCORR (bias-corrected over land): which one to use?

Annual mean anomaly trends (Mann-Kendall + Sen, 1980–2025) for a few regions,
plus the global mean, for both fields side by side.

    uv run compare_precip.py
"""
from __future__ import annotations

import glob

import numpy as np
import pymannkendall as mk
import xarray as xr

from download import RAW

# name, lat min, lat max, lon min, lon max
REGIONS = [
    ("Amazon basin", -10, 0, -70, -50),
    ("Turkey", 36, 42, 26, 45),
    ("Sahel", 10, 18, -15, 30),
    ("India (monsoon)", 15, 28, 72, 88),
    ("Europe", 45, 55, 0, 20),
    ("Tropical Pacific (ocean)", -5, 5, -170, -120),
    ("Global", -90, 90, -180, 180),
]

files = [f for f in sorted(glob.glob(str(RAW / "M2TMNXFLX" / "*.nc4"))) if f[-10:-6] <= "2025"]
parts = []
for f in files:
    with xr.open_dataset(f) as one:
        parts.append(one[["PRECTOT", "PRECTOTCORR"]].load())
ds = xr.concat(parts, dim="time") * 86400  # mm/day, 1980-01 .. 2025-12
w = np.cos(np.radians(ds.lat))

print(f"{'region':26s} {'field':12s} {'mean mm/d':>9s} {'trend /10y':>11s} {'p':>8s}")
for name, la0, la1, lo0, lo1 in REGIONS:
    sub = ds.sel(lat=slice(la0, la1), lon=slice(lo0, lo1))
    for field in ("PRECTOT", "PRECTOTCORR"):
        s = sub[field].weighted(w.sel(lat=slice(la0, la1))).mean(("lat", "lon"))
        annual = s.groupby("time.year").mean().values
        r = mk.original_test(annual)
        print(f"{name:26s} {field:12s} {annual.mean():9.3f} {r.slope * 10:+11.4f} {r.p:8.4f}")
    print()
