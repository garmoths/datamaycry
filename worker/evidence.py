"""Physical-consistency experiments on the real MERRA-2 data.

Each experiment states a hypothesis from physics or a documented event, the
expected value from the literature, and a pass criterion. All criteria were
written into this file BEFORE the experiments were run (2026-11-14) and must
not be tuned afterwards; a failed experiment is reported as failed.

  P1 Water balance          global precipitation ≈ global evaporation
  P2 Clausius-Clapeyron     ocean humidity rises ~7 % per K of warming
  P3 Arctic amplification   the Arctic warms 2–5× faster than the globe
  P4 Pinatubo (1991)        aerosol peak in 1991/92, global cooling in 1992
  P5 El Niño                strongest Niño-3.4 warm peaks = known strong El Niños
  P6 Snow vs temperature    warmer years have less snow (NH mid/high-latitude land)

    uv run evidence.py   → data/logs/evidence_physical.json
"""
from __future__ import annotations

import glob
import json
from datetime import date

import numpy as np
import xarray as xr

import protocol as P
from download import ROOT

RAW = ROOT / "data" / "raw"
OUT = ROOT / "data" / "logs" / "evidence_physical.json"
LAT = np.arange(361) * 0.5 - 90
LON = np.arange(576) * 0.625 - 180
LAT2 = np.repeat(LAT[:, None], 576, axis=1)
LON2 = np.repeat(LON[None, :], 361, axis=0)
W = np.cos(np.radians(LAT2))
YEARS = np.arange(1980, 2026)


def masked_series(coll: str, var: str, masks: dict[str, np.ndarray]) -> dict[str, np.ndarray]:
    """Monthly area-weighted means (raw units) for each mask, NaN-aware. 1980-01 → last month."""
    files = sorted(glob.glob(str(RAW / coll / "[0-9]*.nc4")))
    out = {k: np.empty(len(files)) for k in masks}
    for t, f in enumerate(files):
        with xr.open_dataset(f) as ds:
            a = ds[var].values[0]
        ok = ~np.isnan(a)
        for k, m in masks.items():
            w = W * m * ok
            out[k][t] = (np.where(ok, a, 0) * w).sum() / w.sum() if w.sum() > 0 else np.nan
    return out


def annual(monthly: np.ndarray) -> np.ndarray:
    """Calendar-year means of monthly anomalies for 1980–2025."""
    a = P.anomalies(monthly, "1980-01")
    return np.array([a[k * 12:(k + 1) * 12].mean() for k in range(len(YEARS))])


def annual_mean(monthly: np.ndarray) -> np.ndarray:
    return np.array([monthly[k * 12:(k + 1) * 12].mean() for k in range(len(YEARS))])


def sen10(series: np.ndarray) -> float:
    return P.sen_slope(YEARS, series).slope * 10


def main() -> None:
    with xr.open_dataset(RAW / "const" / "M2C0NXASM.nc4") as c:
        frland = c.FRLAND.values[0]
        frocean = c.FROCEAN.values[0]
    globe = np.ones((361, 576))
    masks_t = {
        "global": globe,
        "arctic": (LAT2 >= 66.5).astype(float),
        "ocean60": ((frocean >= 0.9) & (np.abs(LAT2) <= 60)).astype(float),
        "nino34": ((np.abs(LAT2) <= 5) & (LON2 >= -170) & (LON2 <= -120)).astype(float),
        "nhland": ((LAT2 >= 40) & (LAT2 <= 70) & (frland >= 0.5)).astype(float),
    }
    t2m = masked_series("M2TMNXSLV", "T2M", masks_t)
    qv = masked_series("M2TMNXSLV", "QV2M", {"ocean60": masks_t["ocean60"]})["ocean60"]
    pe = masked_series("M2TMNXFLX", "PRECTOT", {"global": globe})["global"]
    ev = masked_series("M2TMNXFLX", "EVAP", {"global": globe})["global"]
    aod = masked_series("M2TMNXAER", "TOTEXTTAU", {"global": globe})["global"]
    snow = masked_series("M2TMNXLND", "SNOMAS", {"nhland": masks_t["nhland"]})["nhland"]

    results = []

    # P1 water balance (Bosilovich et al. 2017, J. Climate: MERRA-2 global budget closes well)
    p_mm = annual_mean(pe[:552]).mean() * 86400
    e_mm = annual_mean(ev[:552]).mean() * 86400
    imbalance = abs(p_mm - e_mm) / p_mm
    results.append({
        "id": "P1", "name": "Water balance: global precipitation = global evaporation",
        "physics": "Over decades the atmosphere stores no extra water, so what evaporates must fall.",
        "expected": "|P − E| / P < 3 %", "source": "Bosilovich, Robertson, Takacs et al. (2017), J. Climate 30, 1177–1196",
        "result": {"precip_mm_day": round(p_mm, 4), "evap_mm_day": round(e_mm, 4), "imbalance_pct": round(imbalance * 100, 3)},
        "passed": bool(imbalance < 0.03),
    })

    # P2 Clausius-Clapeyron (Held & Soden 2006: ~7 %/K near-surface specific humidity over ocean)
    lnq = np.log(annual_mean(qv[:552]))
    t_ocean = annual_mean(t2m["ocean60"][:552])
    slope, _ = np.polyfit(t_ocean - t_ocean.mean(), lnq - lnq.mean(), 1)
    r = float(np.corrcoef(t_ocean, lnq)[0, 1])
    cc = slope * 100
    results.append({
        "id": "P2", "name": "Clausius-Clapeyron: ocean humidity vs temperature",
        "physics": "Saturation vapour pressure grows ~7 % per K; with near-constant relative humidity, so does q.",
        "expected": "5–8 % per K", "source": "Held & Soden (2006), J. Climate 19, 5686–5702",
        "result": {"pct_per_K": round(cc, 2), "r": round(r, 3), "region": "ocean (FROCEAN ≥ 0.9), 60°S–60°N, annual means"},
        "passed": bool(5 <= cc <= 8),
    })

    # P3 Arctic amplification (Rantanen et al. 2022: ~3.8× for 1979–2021)
    g = annual(t2m["global"][:552])
    a = annual(t2m["arctic"][:552])
    ratio = sen10(a) / sen10(g)
    results.append({
        "id": "P3", "name": "Arctic amplification",
        "physics": "Sea-ice and snow loss lower the surface albedo, so the Arctic warms faster than the globe.",
        "expected": "Arctic (≥ 66.5°N) trend / global trend between 2 and 5",
        "source": "Rantanen et al. (2022), Communications Earth & Environment 3, 168",
        "result": {"arctic_C_per_decade": round(sen10(a), 3), "global_C_per_decade": round(sen10(g), 3), "ratio": round(ratio, 2)},
        "passed": bool(2 <= ratio <= 5),
    })

    # P4 Pinatubo natural experiment (eruption June 1991; Hansen et al. 1992, Soden et al. 2002)
    aod_y = annual_mean(aod[:552])
    peak = int(YEARS[int(np.argmax(aod_y))])
    dip = g[YEARS == 1992][0] - (g[YEARS == 1990][0] + g[YEARS == 1991][0]) / 2
    results.append({
        "id": "P4", "name": "Mount Pinatubo eruption (June 1991)",
        "physics": "Stratospheric sulfate aerosol reflects sunlight: aerosol optical depth peaks, the surface cools the next year.",
        "expected": "global AOD maximum in 1991 or 1992 AND 1992 global T2M ≥ 0.1 °C below the 1990–91 mean",
        "source": "Hansen et al. (1992), GRL 19, 215–218; Soden et al. (2002), Science 296, 727–730",
        "result": {"aod_peak_year": peak, "aod_1992": round(float(aod_y[YEARS == 1992][0]), 4),
                   "aod_mean_1980_2025": round(float(aod_y.mean()), 4), "t2m_1992_minus_1990_91_C": round(float(dip), 3)},
        "passed": bool(peak in (1991, 1992) and dip <= -0.1),
    })

    # P5 ENSO (NOAA ONI: strongest El Niños 1982–83, 1997–98, 2015–16)
    n34 = P.anomalies(t2m["nino34"][:552], "1980-01")
    djf = {}
    for y in range(1980, 2025):  # DJF labelled by the December year
        k = (y - 1980) * 12 + 11
        djf[y] = float(n34[k:k + 3].mean())
    top3 = sorted(djf, key=djf.get, reverse=True)[:3]
    known = {1982, 1997, 2015}
    results.append({
        "id": "P5", "name": "El Niño events in the tropical Pacific",
        "physics": "El Niño warms the central/east equatorial Pacific; the data must show the documented events.",
        "expected": "≥ 2 of the 3 warmest Niño-3.4 DJF anomalies are 1982–83, 1997–98, 2015–16",
        "source": "NOAA CPC Oceanic Niño Index (ONI) event list",
        "result": {"warmest_djf_dec_years": top3, "anomalies_C": [round(djf[y], 2) for y in top3]},
        "passed": bool(len(known & set(top3)) >= 2),
    })

    # P6 snow vs temperature (Brown & Robinson 2011; snow-albedo feedback)
    s = annual(snow[:552])
    t_nh = annual(t2m["nhland"][:552])
    rs = float(np.corrcoef(s, t_nh)[0, 1])
    results.append({
        "id": "P6", "name": "Snow amount vs temperature (NH land 40–70°N)",
        "physics": "Warmer years melt more snow and turn more snowfall into rain.",
        "expected": "correlation of annual snow and temperature anomalies < −0.3",
        "source": "Brown & Robinson (2011), The Cryosphere 5, 219–229",
        "result": {"r": round(rs, 3), "snow_mm_per_decade": round(sen10(s), 3), "t2m_C_per_decade": round(sen10(t_nh), 3)},
        "passed": bool(rs < -0.3),
    })

    doc = {"generated": date.today().isoformat(), "data": "NASA MERRA-2 v5.12.4 monthly, 1980–2025",
           "criteria_fixed_before_run": True, "passed": sum(r["passed"] for r in results),
           "total": len(results), "experiments": results}
    OUT.write_text(json.dumps(doc, indent=2, ensure_ascii=False))
    for r in results:
        print(f"{r['id']} {'PASS' if r['passed'] else 'FAIL'}  {r['name']}: {r['result']}  (expected {r['expected']})")
    print(f"\n{doc['passed']}/{doc['total']} passed → {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
