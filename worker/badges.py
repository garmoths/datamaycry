"""Independent-source badges (PLAN.md §3.6 L4, §3.7-4) → data/package/regions/badges.json

  GPCP  NASA GPCP v3.3 precipitation (1983–2025) vs MERRA-2 PRECTOT, every region
  GHCN  NOAA GHCN-M v4 homogenized station temperature (1980–2025) vs MERRA-2 T2M,
        provinces and countries that contain qualifying stations
Plus a global check against NASA GISTEMP v4 (report only, data/logs/validation.json).

Agreement rule: contract/types.ts (fixed before any badge was computed).

    uv run badges.py
"""
from __future__ import annotations

import glob
import json
from dataclasses import dataclass
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
import xarray as xr

import protocol as P
from dmc import SCHEMA_VERSION, read_dmc, validate
from download import ROOT
from package import NCELL, region_means, weight_matrix
from regions import province_ids

PKG = ROOT / "data" / "package"
RAW = ROOT / "data" / "raw"
LOGS = ROOT / "data" / "logs"
GPCP_YEARS = (1983, 2025)
GHCN_YEARS = (1980, 2025)


@dataclass
class Summary:
    slope: float  # per decade
    lo: float
    hi: float
    p: float

    def json(self) -> dict:
        return {"slopePerDecade": round(self.slope, 5), "ci95": [round(self.lo, 5), round(self.hi, 5)],
                "pValue": round(self.p, 6)}


def summarize_annual(years: np.ndarray, annual: np.ndarray, y0: int, y1: int) -> Summary | None:
    """MK + Sen + corrected CI on annual anomalies (same statistics as protocol.analyze)."""
    ok = ~np.isnan(annual) & (years >= y0) & (years <= y1)
    if ok.sum() < (y1 - y0 + 1) * (1 - P.MAX_MISSING_YEAR_FRACTION):
        return None
    y, a = years[ok], annual[ok]
    if np.all(a == a[0]):
        return None
    mk = P.mann_kendall(a)
    s = P.sen_slope(y, a)
    return Summary(s.slope * 10, s.ci95[0] * 10, s.ci95[1] * 10, mk.p)


def annual_anomalies(values: np.ndarray, start: str) -> tuple[np.ndarray, np.ndarray]:
    """Annual means of monthly anomalies (complete years only), every calendar year in the series."""
    anom = P.anomalies(values, start)
    yr, _ = P.month_index(start, len(values))
    years = np.unique(yr)
    out = np.full(len(years), np.nan)
    for k, y in enumerate(years):
        a = anom[yr == y]
        if len(a) == 12 and not np.isnan(a).any():
            out[k] = a.mean()
    return years, out


def status(ours: Summary, ref: Summary) -> str:
    same = np.sign(ours.slope) == np.sign(ref.slope)
    overlap = ours.lo <= ref.hi and ref.lo <= ours.hi
    if same and overlap:
        return "agree"
    if (not same and (ours.p < 0.05 or ref.p < 0.05)) or (same and not overlap):
        return "disagree"
    return "inconclusive"


def region_series(var: str) -> dict[str, np.ndarray]:
    """Packaged monthly series (what users see) for every region, one variable."""
    out = {}
    for f in sorted((PKG / "regions").glob("*.bin")):
        h, d = read_dmc(f)
        v = h["vars"].index(var)
        nv, m = len(h["vars"]), h["months"]
        pk = h["packing"][v]
        for r, reg in enumerate(h["regions"]):
            raw = d[(r * nv + v) * m:(r * nv + v + 1) * m]
            out[reg["id"]] = np.where(raw == -32768, np.nan, raw * pk["scale"] + pk["offset"])
    return out


# ─── GPCP ───────────────────────────────────────────────────────────────────

def gpcp_badges(table: pd.DataFrame, ours_series: dict[str, np.ndarray]) -> dict[str, list]:
    files = sorted(glob.glob(str(RAW / "GPCPMON" / "*.nc4")))
    months0 = files[0].split("/")[-1][:6]
    lat = np.arange(361) * 0.5 - 90
    lon = np.arange(576) * 0.625 - 180
    cube = np.empty((len(files), NCELL), dtype=np.float32)
    for k, f in enumerate(files):
        with xr.open_dataset(f) as ds:
            g = ds.sat_gauge_precip.isel(time=0)
            g = g.sortby("lat").reindex(lat=lat, lon=lon, method="nearest", tolerance=0.5)
            cube[k] = g.values.reshape(-1)
    start = f"{months0[:4]}-{months0[4:]}"
    ids = sorted(set(table.region_id))
    W = weight_matrix(table, ids)
    ref_monthly = region_means(W, cube)
    badges: dict[str, list] = {}
    for k, rid in enumerate(ids):
        if rid not in ours_series:
            continue
        ry, ra = annual_anomalies(ref_monthly[k], start)
        oy, oa = annual_anomalies(ours_series[rid], "1980-01")
        ref = summarize_annual(ry, ra, *GPCP_YEARS)
        ours = summarize_annual(oy, oa, *GPCP_YEARS)
        if ref is None or ours is None:
            continue
        badges.setdefault(rid, []).append({
            "source": "GPCP", "var": "PRECTOT", "status": status(ours, ref),
            "years": {"start": GPCP_YEARS[0], "end": GPCP_YEARS[1]},
            "ours": ours.json(), "ref": ref.json(),
        })
    return badges


# ─── GHCN stations ──────────────────────────────────────────────────────────

def read_ghcn() -> tuple[pd.DataFrame, dict[str, np.ndarray]]:
    base = sorted(glob.glob(str(RAW / "ghcn" / "x" / "*" / "*.qcf.dat")))[0]
    inv = pd.read_fwf(base.replace(".dat", ".inv"), colspecs=[(0, 11), (12, 20), (21, 30), (31, 37), (38, 68)],
                      names=["id", "lat", "lon", "elev", "name"])
    y0, y1 = GHCN_YEARS
    n = (y1 - y0 + 1) * 12
    series: dict[str, np.ndarray] = {}
    with open(base) as fh:
        for line in fh:
            year = int(line[11:15])
            if year < y0 or year > y1 or line[15:19] != "TAVG":
                continue
            s = series.setdefault(line[:11], np.full(n, np.nan))
            for m in range(12):
                o = 19 + m * 8
                v = int(line[o:o + 5])
                qc = line[o + 6]
                if v != -9999 and qc == " ":
                    s[(year - y0) * 12 + m] = v / 100.0
    return inv, series


def ghcn_badges(ours_series: dict[str, np.ndarray]) -> tuple[dict[str, list], dict]:
    inv, series = read_ghcn()
    good = {}
    for sid, v in series.items():
        years, annual = annual_anomalies(v, f"{GHCN_YEARS[0]}-01")
        if summarize_annual(years, annual, *GHCN_YEARS) is not None:
            good[sid] = annual
    years = np.arange(GHCN_YEARS[0], GHCN_YEARS[1] + 1)
    st = inv[inv.id.isin(good)].copy()
    pts = gpd.GeoDataFrame(st, geometry=gpd.points_from_xy(st.lon, st.lat), crs="EPSG:4326")
    a1 = gpd.read_file(RAW / "naturalearth" / "ne_10m_admin_1_states_provinces" / "ne_10m_admin_1_states_provinces.shp")
    a1["rid"] = province_ids(a1)
    j = gpd.sjoin(pts, a1[["rid", "adm0_a3", "geometry"]], predicate="within", how="inner")

    badges: dict[str, list] = {}
    stats = {"stations_total": len(series), "stations_qualifying": len(good), "stations_in_province": len(j)}

    def add(rid: str, sids: list[str], names: list[str]) -> None:
        if rid not in ours_series:
            return
        ref_annual = np.nanmean(np.stack([good[s] for s in sids]), axis=0)
        ref = summarize_annual(years, ref_annual, *GHCN_YEARS)
        oy, oa = annual_anomalies(ours_series[rid], "1980-01")
        ours = summarize_annual(oy, oa, *GHCN_YEARS)
        if ref is None or ours is None:
            return
        shown = ", ".join(names[:5]) + (f" +{len(names) - 5}" if len(names) > 5 else "")
        badges.setdefault(rid, []).append({
            "source": "GHCN", "var": "T2M", "status": status(ours, ref),
            "years": {"start": GHCN_YEARS[0], "end": GHCN_YEARS[1]},
            "ours": ours.json(), "ref": ref.json(),
            "detail": {"en": f"{len(sids)} station(s): {shown}", "tr": f"{len(sids)} istasyon: {shown}"},
        })

    for rid, g in j.groupby("rid"):
        add(rid, g.id.tolist(), g.name.str.strip().tolist())
    for cid, g in j.groupby("adm0_a3"):
        add(cid, g.id.tolist(), g.name.str.strip().tolist())
    return badges, stats


# ─── GISTEMP (global, report only) ──────────────────────────────────────────

def gistemp_check() -> dict:
    df = pd.read_csv(RAW / "gistemp" / "GLB.Ts+dSST.csv", skiprows=1, na_values="***")
    df = df[(df.Year >= 1980) & (df.Year <= 2025)]
    ref = summarize_annual(df.Year.values, df["J-D"].astype(float).values, 1980, 2025)
    files = sorted(glob.glob(str(RAW / "M2TMNXSLV" / "[0-9]*.nc4")))
    w = np.cos(np.radians(np.arange(361) * 0.5 - 90))[:, None]
    g = []
    for f in files:
        with xr.open_dataset(f) as ds:
            a = ds.T2M.values[0]
            g.append(float((a * w).sum() / (w.sum() * a.shape[1])))
    years, annual = annual_anomalies(np.array(g) - 273.15, "1980-01")
    ours = summarize_annual(years, annual, 1980, 2025)
    oa = annual[(years >= 1980) & (years <= 2025)]
    r = float(np.corrcoef(oa, df["J-D"].astype(float).values)[0, 1])
    return {"source": "NASA GISTEMP v4 (GLB.Ts+dSST)", "years": [1980, 2025], "status": status(ours, ref),
            "ours": ours.json(), "ref": ref.json(), "annual_correlation": round(r, 3)}


def main() -> None:
    LOGS.mkdir(parents=True, exist_ok=True)
    table = pd.read_parquet(ROOT / "data" / "derived" / "region_cells.parquet")
    precip = region_series("PRECTOT")
    temp = region_series("T2M")
    g = gpcp_badges(table, precip)
    s, ststats = ghcn_badges(temp)
    regions: dict[str, list] = {}
    for src in (g, s):
        for rid, b in src.items():
            regions.setdefault(rid, []).extend(b)
    doc = {"schema_version": SCHEMA_VERSION, "kind": "badges", "regions": regions}
    validate(doc, "badges")
    (PKG / "regions" / "badges.json").write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")))

    def count(src: dict) -> dict:
        c = {"agree": 0, "disagree": 0, "inconclusive": 0}
        for b in src.values():
            for x in b:
                c[x["status"]] += 1
        return c

    report = {"gpcp": count(g), "ghcn": count(s), "ghcn_stations": ststats, "gistemp": gistemp_check()}
    (LOGS / "validation.json").write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))
    for rid in ("TUR", "TR-21", "TR-42", "TR-06", "BR-AM", "EGY"):
        for b in regions.get(rid, []):
            print(f"  {rid:6s} {b['source']} {b['var']:7s} {b['status']:12s} ours {b['ours']['slopePerDecade']:+.3f} "
                  f"ref {b['ref']['slopePerDecade']:+.3f}  {b.get('detail', {}).get('en', '')}")


if __name__ == "__main__":
    main()
