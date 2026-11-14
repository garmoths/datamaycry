"""Real MERRA-2 data → contract files (PLAN.md §4 steps 3–5, §8 step 11).

Reads data/raw (NetCDF) and data/derived (region overlap table), writes
data/package/ with exactly the same layout as the mock data:

  variables.json                 variables, units, packing, period
  regions/index.json             continents, countries, provinces (+ cells, low_resolution)
  regions/{COUNTRY}.bin          country + provinces, monthly, area-weighted (step 6)
  regions/continents.bin         the 7 continents
  trend_map/{VAR}.bin            per cell: Sen slope/decade, MK p, level (R1/R4 + CI rule), FDR
  tiles/{VAR}/{ty}_{tx}.bin      10°×10° monthly cells for Point mode (→ Cloudflare R2)

Then runs the same contract validation as the mock data.

    uv run package.py                  # all variables
    uv run package.py --vars T2M       # one variable (test)
"""
from __future__ import annotations

import argparse
import glob
import json
import shutil
import time
from datetime import date

import numpy as np
import pandas as pd
import scipy.sparse as sp
import xarray as xr

import protocol as P
from dmc import SCHEMA_VERSION, pack, validate, write_dmc
from frames import coarsen2x2, write_frames
from download import COLLECTIONS, ROOT
from mock import CAVEAT, EXPERIMENTAL, GRID, SOURCE_FIELD, VARS
from validate import check

RAW = ROOT / "data" / "raw"
DERIVED = ROOT / "data" / "derived"
OUT = ROOT / "data" / "package"
START, NLAT, NLON = "1980-01", 361, 576
NCELL = NLAT * NLON
COLL_OF = {v: c for c, vs in COLLECTIONS.items() for v in vs}
META = {v[0]: v for v in VARS}  # id → mock VARS tuple (names, units, packing, ...)
log_t0 = time.time()


def log(msg: str) -> None:
    print(f"[{time.time() - log_t0:6.0f}s] {msg}", flush=True)


def load_cube(var: str) -> tuple[np.ndarray, int, str]:
    """(months, cells) float32 in display units, NaN = no data."""
    src = SOURCE_FIELD.get(var, var)
    files = sorted(glob.glob(str(RAW / COLL_OF[src] / "[0-9]*.nc4")))
    cube = np.empty((len(files), NCELL), dtype=np.float32)
    for k, f in enumerate(files):
        with xr.open_dataset(f) as ds:
            cube[k] = ds[src].values[0].reshape(-1)
    mul, add, _ = P.UNITS[var]
    cube = cube * np.float32(mul) + np.float32(add)
    last = files[-1].split("/")[-1][:6]
    return cube, len(files), f"{last[:4]}-{last[4:]}"


# ─── Step 6: region averages ────────────────────────────────────────────────

def weight_matrix(table: pd.DataFrame, ids: list[str]) -> sp.csr_matrix:
    pos = {r: k for k, r in enumerate(ids)}
    t = table[table.region_id.isin(pos)]
    return sp.csr_matrix((t.weight.values, (t.region_id.map(pos).values, t.cell_id.values)),
                         shape=(len(ids), NCELL))


def region_means(W: sp.csr_matrix, cube: np.ndarray) -> np.ndarray:
    """Area-weighted mean per region and month, ignoring NaN cells. (regions, months)"""
    ok = ~np.isnan(cube)
    num = W @ np.where(ok, cube, 0).astype(np.float64).T
    den = W @ ok.astype(np.float64).T
    with np.errstate(invalid="ignore", divide="ignore"):
        return np.where(den > 0, num / den, np.nan)


# ─── Trend map (steps 3–5 + L3 per cell) ────────────────────────────────────

def annual_anomalies(cube: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Monthly anomalies vs the 1991–2020 normal and their calendar-year means (cells, 46).
    A year is NaN in a cell if any of its months is missing (same rule as the trend test)."""
    n = cube.shape[0]
    yr, mo = P.month_index(START, n)
    base = (yr >= P.BASELINE[0]) & (yr <= P.BASELINE[1])
    with np.errstate(invalid="ignore"), __import__("warnings").catch_warnings():
        __import__("warnings").simplefilter("ignore", RuntimeWarning)  # all-NaN ocean cells
        clim = np.stack([np.nanmean(cube[base & (mo == m)], axis=0) for m in range(1, 13)])
    anom = cube - clim[mo - 1]
    years = np.arange(P.TEST_YEARS[0], P.TEST_YEARS[1] + 1)
    annual = np.stack([anom[yr == y].mean(0) for y in years]).T
    return anom, annual


def trend_map(cube: np.ndarray, var: str) -> dict[str, np.ndarray]:
    n = cube.shape[0]
    yr, mo = P.month_index(START, n)
    anom, annual = annual_anomalies(cube)
    years = np.arange(P.TEST_YEARS[0], P.TEST_YEARS[1] + 1)

    slope = np.full(NCELL, np.nan)
    pval = np.full(NCELL, np.nan)
    level = np.full(NCELL, np.nan)
    valid = ~np.isnan(annual).any(1)
    const = valid & (np.nanmax(annual, 1) == np.nanmin(annual, 1))
    test = valid & ~const
    idx = np.where(test)[0]
    a = annual[idx]
    s, v, p, _ = P.mk_sen_grid(a, years)
    sl, lo, hi = P.sen_ci_grid(a, years, v)
    ci_ok = (lo > 0) | (hi < 0)
    lev = np.where((p < 0.05) & ci_ok, 1.0, 0.0)

    # R4 for candidates: pre-whitened monthly MK + trimmed annual MK, same direction
    cand = np.where((p < 0.01) & ci_ok & (sl != 0))[0]
    tsel = (yr >= years[0]) & (yr <= years[-1])
    trim = (years >= years[0] + 5) & (years <= years[-1] - 5)
    for k in cand:
        c = idx[k]
        sign = np.sign(sl[k])
        pw = P.fast_prewhitened_mk(anom[tsel, c])
        if not (pw.p < 0.01 and np.sign(pw.s) == sign):
            continue
        tr = P.mann_kendall(a[k, trim])
        if tr.p < 0.05 and np.sign(tr.s) == sign:
            lev[k] = 2.0
    if var in EXPERIMENTAL:
        lev = np.minimum(lev, 1.0)

    slope[idx] = sl * 10
    pval[idx] = p
    level[idx] = lev
    slope[const] = 0.0
    pval[const] = 1.0
    level[const] = 0.0
    fdr = P.fdr_bh(pval).astype(float)
    fdr[np.isnan(pval)] = np.nan
    return {"slope_per_decade": slope, "p_value": pval, "level": level, "fdr": fdr,
            "n_candidates": len(cand), "annual": annual}


def write_var_frames(var: str, annual: np.ndarray) -> None:
    """Yearly anomaly maps for the animation (contract 1.4), 2×2-coarsened."""
    frames, grid = coarsen2x2(annual.T)
    h = write_frames(OUT, var, frames, grid, P.TEST_YEARS)
    log(f"{var}: anomaly frames {frames.shape}, colour scale ±{h['color_max']:.4g}")


def nice_scale(max_abs: float) -> float:
    """Smallest 1/2/5 × 10^k scale so that max_abs fits in int16 with headroom."""
    raw = max(max_abs, 1e-12) / 30000
    k = np.floor(np.log10(raw))
    for m in (1, 2, 5, 10):
        if m * 10 ** k >= raw:
            return float(m * 10 ** k)
    return float(10 ** (k + 1))


# ─── Main ───────────────────────────────────────────────────────────────────

def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--vars", nargs="*", default=[v[0] for v in VARS])
    ap.add_argument("--no-tiles", action="store_true")
    ap.add_argument("--frames-only", action="store_true",
                    help="only (re)write anomaly_frames/ into the existing package")
    args = ap.parse_args()

    if args.frames_only:
        for var in args.vars:
            cube, _, _ = load_cube(var)
            _, annual = annual_anomalies(cube)
            write_var_frames(var, annual)
            del cube
        log(f"DONE: {check(OUT)} files match contract v{SCHEMA_VERSION}")
        return

    if OUT.exists():
        shutil.rmtree(OUT)
    (OUT / "regions").mkdir(parents=True)

    meta = json.loads((DERIVED / "region_meta.json").read_text())
    table = pd.read_parquet(DERIVED / "region_cells.parquet")
    countries = meta["countries"]
    cont_ids = [c["id"] for c in meta["continents"]]
    groups = {c["id"]: [c["id"]] + [p["id"] for p in c["admin1"]] for c in countries}
    # One stacked matrix for all countries + provinces → one multiplication per variable.
    all_ids = [r for ids in groups.values() for r in ids]
    tc = table[table.level.isin(["country", "admin1"])]
    W_all = sp.vstack([weight_matrix(tc[tc.region_id.isin(ids)], ids) for ids in groups.values()]).tocsr()
    offsets, k = {}, 0
    for cid, ids in groups.items():
        offsets[cid] = (k, k + len(ids))
        k += len(ids)
    assert k == len(all_ids)
    W_cont = weight_matrix(table[table.level == "continent"], cont_ids)
    log(f"weights ready: {len(countries)} countries, {sum(map(len, groups.values()))} regions")

    region_data: dict[str, list[np.ndarray]] = {cid: [] for cid in groups}
    cont_data: list[np.ndarray] = []
    packings: list[dict] = []
    months, last = None, None
    for var in args.vars:
        scale = META[var][6]
        cube, months, last = load_cube(var)
        log(f"{var}: loaded {cube.shape}, range {np.nanmin(cube):.4g}..{np.nanmax(cube):.4g}")
        allm = region_means(W_all, cube)
        for cid, (a, b) in offsets.items():
            region_data[cid].append(allm[a:b])
        cont_data.append(region_means(W_cont, cube))
        packings.append({"scale": scale, "offset": 0})
        log(f"{var}: region series done")

        tm = trend_map(cube, var)
        write_var_frames(var, tm["annual"])
        sscale = nice_scale(np.nanmax(np.abs(tm["slope_per_decade"])))
        fields = ["slope_per_decade", "p_value", "level", "fdr"]
        packs = [{"scale": sscale, "offset": 0}, {"scale": 1 / 32000, "offset": 0},
                 {"scale": 1, "offset": 0}, {"scale": 1, "offset": 0}]
        payload = np.concatenate([pack(tm[f], pk["scale"], 0) for f, pk in zip(fields, packs)])
        header = {"schema_version": SCHEMA_VERSION, "kind": "trend_map", "var": var, "grid": GRID,
                  "years": {"start": P.TEST_YEARS[0], "end": P.TEST_YEARS[1]},
                  "fields": fields, "packing": packs}
        validate(header, "trend_map_header")
        write_dmc(OUT / "trend_map" / f"{var}.bin", header, payload)
        lv = tm["level"]
        log(f"{var}: trend map: cells tested {np.isfinite(lv).sum()}, possible {(lv == 1).sum()}, "
            f"strong {(lv == 2).sum()}, FDR {int(np.nansum(tm['fdr']))}, R4 candidates {tm['n_candidates']}")

        if not args.no_tiles:
            for ty in range(18):
                i0 = ty * 20
                nlat = 21 if ty == 17 else 20
                for tx in range(36):
                    j0 = tx * 16
                    ii, jj = np.meshgrid(np.arange(i0, i0 + nlat), np.arange(j0, j0 + 16), indexing="ij")
                    block = cube[:, (ii * NLON + jj).reshape(-1)].T  # (cells, months)
                    th = {"schema_version": SCHEMA_VERSION, "kind": "tile", "var": var, "tx": tx, "ty": ty,
                          "i0": i0, "j0": j0, "nlat": nlat, "nlon": 16, "start": START, "months": months,
                          "packing": {"scale": scale, "offset": 0}}
                    write_dmc(OUT / "tiles" / var / f"{ty}_{tx}.bin", th, pack(block, scale, 0))
            validate(th, "tile_header")
            log(f"{var}: 648 tiles written")
        del cube

    vids = list(args.vars)
    for cid, ids in groups.items():
        payload = np.stack([pack(x, pk["scale"], 0) for x, pk in zip(region_data[cid], packings)], axis=1)
        header = {"schema_version": SCHEMA_VERSION, "kind": "region", "country": cid, "start": START,
                  "months": months, "regions": [{"id": ids[0], "level": "country"}] +
                  [{"id": r, "level": "admin1"} for r in ids[1:]], "vars": vids, "packing": packings}
        validate(header, "region_header")
        write_dmc(OUT / "regions" / f"{cid}.bin", header, payload)
    payload = np.stack([pack(x, pk["scale"], 0) for x, pk in zip(cont_data, packings)], axis=1)
    header = {"schema_version": SCHEMA_VERSION, "kind": "region", "country": "continents", "start": START,
              "months": months, "regions": [{"id": c, "level": "continent"} for c in cont_ids],
              "vars": vids, "packing": packings}
    write_dmc(OUT / "regions" / "continents.bin", header, payload)

    index = {"schema_version": SCHEMA_VERSION, "kind": "region_index",
             "continents": meta["continents"], "countries": countries}
    validate(index, "region_index")
    (OUT / "regions" / "index.json").write_text(json.dumps(index, ensure_ascii=False, separators=(",", ":")))

    variables = []
    for vid in vids:
        m = META[vid]
        v = {"id": vid, "collection": m[1], "name": {"en": m[9][0], "tr": m[9][1]},
             "description": {"en": m[10][0], "tr": m[10][1]}, "unit": m[2], "unit_raw": m[3],
             "convert": {"mul": m[4], "add": m[5]}, "packing": {"scale": m[6], "offset": 0},
             "decimals": m[7], "land_only": m[8]}
        if vid in CAVEAT:
            v["caveat"] = {"en": CAVEAT[vid][0], "tr": CAVEAT[vid][1]}
        if vid in EXPERIMENTAL:
            v["experimental"] = True
        if vid in SOURCE_FIELD:
            v["source_field"] = SOURCE_FIELD[vid]
        variables.append(v)
    doc = {"schema_version": SCHEMA_VERSION, "kind": "variables", "dataset": "NASA MERRA-2 v5.12.4",
           "processed_at": date.today().isoformat(), "is_mock": False, "grid": GRID,
           "period": {"start": START, "end": last, "months": months},
           "test_years": {"start": P.TEST_YEARS[0], "end": P.TEST_YEARS[1]},
           "baseline_years": {"start": P.BASELINE[0], "end": P.BASELINE[1]}, "variables": variables}
    validate(doc, "variables")
    (OUT / "variables.json").write_text(json.dumps(doc, ensure_ascii=False, indent=2))

    n = check(OUT)
    web = sum(f.stat().st_size for f in OUT.rglob("*") if f.is_file() and "tiles" not in f.parts)
    tiles = sum(f.stat().st_size for f in (OUT / "tiles").rglob("*.bin")) if (OUT / "tiles").exists() else 0
    nfiles = sum(1 for f in OUT.rglob("*") if f.is_file() and "tiles" not in f.parts)
    log(f"DONE: {n} files match contract v{SCHEMA_VERSION}. Vercel part {web / 1e6:.1f} MB in {nfiles} files, "
        f"R2 tiles {tiles / 1e9:.2f} GB")


if __name__ == "__main__":
    main()
