"""Yearly anomaly maps for the "time travel" animation (contract 1.4).

Each value is one year's mean of the monthly anomalies vs the 1991–2020 normal, the
same numbers the trend test uses. The 0.5° × 0.625° MERRA grid is coarsened to
1° × 1.25° by averaging 2×2 cells (NaN-aware: a coarse cell keeps a value when at
least one of its fine cells has data), so a variable is ~4.8 MB instead of ~19 MB.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np

from dmc import SCHEMA_VERSION, pack, validate, write_dmc

MERRA = {"nlat": 361, "nlon": 576, "lat0": -90.0, "lon0": -180.0, "dlat": 0.5, "dlon": 0.625}


def coarsen2x2(fine: np.ndarray, nlat: int = 361, nlon: int = 576) -> tuple[np.ndarray, dict]:
    """fine: (years, nlat*nlon) on the MERRA grid → (years, ceil(nlat/2), nlon/2), NaN-aware mean.

    Coarse cell (i, j) averages fine rows 2i, 2i+1 and columns 2j, 2j+1. Its centre is the
    mean of the fine centres: lat = −90 + 2i·0.5 + 0.25, lon = −180 + 2j·0.625 + 0.3125.
    The last coarse row only has fine row 360 (the north pole row)."""
    n_years = fine.shape[0]
    a = fine.reshape(n_years, nlat, nlon)
    if nlat % 2:  # pad one NaN row so rows pair up
        a = np.concatenate([a, np.full((n_years, 1, nlon), np.nan, dtype=a.dtype)], axis=1)
    b = a.reshape(n_years, a.shape[1] // 2, 2, nlon // 2, 2)
    ok = ~np.isnan(b)
    cnt = ok.sum(axis=(2, 4))
    with np.errstate(invalid="ignore", divide="ignore"):
        out = np.where(cnt > 0, np.where(ok, b, 0).sum(axis=(2, 4)) / cnt, np.nan)
    grid = {"nlat": out.shape[1], "nlon": out.shape[2], "lat0": -89.75, "lon0": -180 + 0.3125,
            "dlat": 1.0, "dlon": 1.25}
    return out.astype(np.float32), grid


def color_max(frames: np.ndarray) -> float:
    """Fixed colour scale: 98th percentile of |anomaly| over all cells and years."""
    v = np.abs(frames[np.isfinite(frames)])
    return float(np.percentile(v, 98)) if v.size else 1.0


def write_frames(out_dir: Path, var: str, frames: np.ndarray, grid: dict, years: tuple[int, int]) -> dict:
    """frames: (years, nlat, nlon) in display units. Returns the header written."""
    cmax = max(color_max(frames), 1e-9)
    big = float(np.nanmax(np.abs(frames))) if np.isfinite(frames).any() else 1.0
    raw = max(big, 1e-12) / 30000
    k = np.floor(np.log10(raw))
    scale = next(float(m * 10 ** k) for m in (1, 2, 5, 10) if m * 10 ** k >= raw)
    header = {
        "schema_version": SCHEMA_VERSION, "kind": "anomaly_frames", "var": var, "grid": grid,
        "years": {"start": years[0], "end": years[1]}, "baseline": {"start": 1991, "end": 2020},
        "packing": {"scale": scale, "offset": 0}, "color_max": round(cmax, 6),
    }
    validate(header, "anomaly_frames_header")
    write_dmc(Path(out_dir) / "anomaly_frames" / f"{var}.bin", header, pack(frames.reshape(-1), scale, 0))
    return header
