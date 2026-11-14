"""Data interpretation protocol (PLAN.md §3.5–3.7), Python side.

Every number on a result card comes from these steps, and the browser
(web/src/stats.ts + trend.ts) must give the same answer (parity test, L2).

  Step 1  clean        _FillValue → NaN, > 20% missing years → no test
  Step 2  units        raw MERRA-2 units → display units
  Step 3  anomalies    value − 1991–2020 mean of that calendar month
  Step 4  trend        annual mean anomalies (complete years only)
                       → Mann-Kendall (ties corrected) + Sen's slope
                       + 95% CI with effective-sample correction
  L3      level        R1 (p < 0.05) → possible
                       R4 (p < 0.01 + pre-whitened monthly p < 0.01 same sign
                           + trimmed ±5 years p < 0.05 same sign) → strong
                       both also need the 95% CI to exclude 0 (added 2026-11-14)
                       experimental variables: never strong
  Step 5  FDR          Benjamini-Hochberg q = 0.05, world map only
  Step 6  regions      area-weighted mean (cos lat × overlap fraction), THEN anomalies
  Step 7  packing      int16, round-trip error < scale / 2

Scalar functions are the reference; `*_grid` functions are the vectorized
versions for 200k cells and are tested to give identical results.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from math import erfc, sqrt

import numpy as np

BASELINE = (1991, 2020)
TEST_YEARS = (1980, 2025)
MIN_YEARS = 10
MAX_MISSING_YEAR_FRACTION = 0.2
Z975 = 1.959963984540054

# Step 2: display = raw * mul + add
UNITS: dict[str, tuple[float, float, str]] = {
    "T2M": (1, -273.15, "°C"),
    "QV2M": (1000, 0, "g/kg"),
    "SPEED": (1, 0, "m/s"),
    "PRECTOT": (86400, 0, "mm/day"),
    "PRECTOTCORR": (86400, 0, "mm/day"),
    "EVAP": (86400, 0, "mm/day"),
    "GWETROOT": (100, 0, "%"),
    "RUNOFF": (86400, 0, "mm/day"),
    "SNOMAS": (1, 0, "mm"),
    "TOTEXTTAU": (1, 0, "AOD"),
}
EXPERIMENTAL = {"RUNOFF"}


def to_display(var: str, raw: np.ndarray) -> np.ndarray:
    mul, add, _ = UNITS[var]
    return np.asarray(raw, dtype=np.float64) * mul + add


# ─── Statistics (scalar reference) ──────────────────────────────────────────

def norm_sf2(z: float) -> float:
    """Two-sided p for a standard normal z."""
    return erfc(abs(z) / sqrt(2))


def mk_variance(x: np.ndarray) -> float:
    n = len(x)
    _, t = np.unique(x, return_counts=True)
    t = t[t > 1]
    return (n * (n - 1) * (2 * n + 5) - float((t * (t - 1) * (2 * t + 5)).sum())) / 18


@dataclass
class MK:
    n: int
    s: float
    var_s: float
    z: float
    p: float


def mann_kendall(x) -> MK:
    x = np.asarray(x, dtype=np.float64)
    x = x[~np.isnan(x)]
    n = len(x)
    i, j = np.triu_indices(n, 1)
    s = float(np.sign(x[j] - x[i]).sum())
    v = mk_variance(x)
    z = 0.0
    if v > 0:
        z = (s - 1) / sqrt(v) if s > 0 else (s + 1) / sqrt(v) if s < 0 else 0.0
    return MK(n, s, v, z, norm_sf2(z))


def lag1(x: np.ndarray) -> float:
    n = len(x)
    if n < 3:
        return 0.0
    d = x - x.mean()
    den = float((d * d).sum())
    return 0.0 if den == 0 else float((d[:-1] * d[1:]).sum() / den)


@dataclass
class Sen:
    slope: float
    intercept: float  # at t[0]
    ci95: tuple[float, float]
    r1: float


def sen_slope(t, y) -> Sen:
    t = np.asarray(t, dtype=np.float64)
    y = np.asarray(y, dtype=np.float64)
    i, j = np.triu_indices(len(y), 1)
    slopes = np.sort((y[j] - y[i]) / (t[j] - t[i]))
    slope = float(np.median(slopes))
    intercept = float(np.median(y) - slope * np.median(t - t[0]))
    resid = y - intercept - slope * (t - t[0])
    r1 = min(max(lag1(resid), 0.0), 0.95)
    var_s = mk_variance(y) * ((1 + r1) / (1 - r1))
    c = Z975 * sqrt(var_s)
    m = len(slopes)
    # JS Math.round rounds .5 up; np.round rounds to even → use floor(x + 0.5)
    m1 = int(np.floor((m - c) / 2 + 0.5))
    m2 = int(np.floor((m + c) / 2 + 0.5))
    lo = slopes[min(max(m1 - 1, 0), m - 1)]
    hi = slopes[min(max(m2, 0), m - 1)]
    return Sen(slope, intercept, (float(lo), float(hi)), r1)


def prewhitened_mk(x) -> MK:
    x = np.asarray(x, dtype=np.float64)
    x = x[~np.isnan(x)]
    r1 = lag1(x)
    return mann_kendall(x[1:] - r1 * x[:-1])


# ─── Steps 3–4 + L3 on one monthly series ───────────────────────────────────

def month_index(start: str, n: int) -> tuple[np.ndarray, np.ndarray]:
    y0, m0 = int(start[:4]), int(start[5:7])
    k = np.arange(n) + (m0 - 1)
    return y0 + k // 12, k % 12 + 1


def anomalies(values: np.ndarray, start: str) -> np.ndarray:
    years, months = month_index(start, len(values))
    out = np.full(len(values), np.nan)
    base = (years >= BASELINE[0]) & (years <= BASELINE[1])
    for m in range(1, 13):
        sel = months == m
        ref = values[sel & base]
        ref = ref[~np.isnan(ref)]
        if ref.size:
            out[sel] = values[sel] - ref.mean()
    return out


@dataclass
class Trend:
    status: str
    start_year: int
    end_year: int
    n_years: int
    slope_per_decade: float = float("nan")
    ci95: tuple[float, float] = (float("nan"), float("nan"))
    p_value: float = float("nan")
    level: str = "none"
    total_change: float = float("nan")
    capped: bool = False
    years: list[int] = field(default_factory=list)
    annual: list[float] = field(default_factory=list)


def analyze(values, start: str, var: str = "", start_year: int = TEST_YEARS[0],
            end_year: int = TEST_YEARS[1], months: list[int] | None = None) -> Trend:
    values = np.asarray(values, dtype=np.float64)
    months = months or list(range(1, 13))
    n_years = end_year - start_year + 1
    anom = anomalies(values, start)
    yr, mo = month_index(start, len(values))
    # Winter (Dec–Feb) crosses the new year: December counts towards the next year's winter.
    wraps = 12 in months and 1 in months and len(months) < 12
    syr = np.where(wraps & (mo == 12), yr + 1, yr)
    sel = (syr >= start_year) & (syr <= end_year) & np.isin(mo, months)
    monthly = anom[sel]
    years, annual = [], []
    for y in range(start_year, end_year + 1):
        a = anom[(syr == y) & np.isin(mo, months)]
        if len(a) == len(months) and not np.isnan(a).any():
            years.append(y)
            annual.append(float(a.mean()))
    base = Trend("ok", start_year, end_year, n_years, years=years, annual=annual)
    if n_years < MIN_YEARS:
        base.status = "too_short"
        return base
    if len(years) < n_years * (1 - MAX_MISSING_YEAR_FRACTION):
        base.status = "insufficient_data"
        return base
    a = np.array(annual)
    if np.all(a == a[0]):
        base.status = "constant"
        return base
    mk_ = mann_kendall(a)
    sen = sen_slope(years, a)
    sign = np.sign(sen.slope)
    # Rule change 2026-11-14 (consistency, not results-driven): the autocorrelation-
    # corrected 95% CI must exclude 0 for ANY trend label. Otherwise a card could say
    # "strong evidence" next to an interval that includes "no change".
    ci_excludes_zero = sen.ci95[0] > 0 or sen.ci95[1] < 0
    level = "possible" if mk_.p < 0.05 and ci_excludes_zero else "none"
    if mk_.p < 0.01 and sign != 0 and ci_excludes_zero:
        pw = prewhitened_mk(monthly)
        ty = np.array(years)
        trimmed = a[(ty >= start_year + 5) & (ty <= end_year - 5)]
        tr = mann_kendall(trimmed) if len(trimmed) >= MIN_YEARS else None
        if pw.p < 0.01 and np.sign(pw.s) == sign and tr and tr.p < 0.05 and np.sign(tr.s) == sign:
            level = "strong"
    capped = False
    if var in EXPERIMENTAL and level == "strong":
        level, capped = "possible", True
    base.slope_per_decade = sen.slope * 10
    base.ci95 = (sen.ci95[0] * 10, sen.ci95[1] * 10)
    base.p_value = mk_.p
    base.level = level
    base.capped = capped
    base.total_change = sen.slope * 10 * (n_years - 1) / 10
    return base


# ─── Step 5: Benjamini-Hochberg FDR ─────────────────────────────────────────

def fdr_bh(p: np.ndarray, q: float = 0.05) -> np.ndarray:
    """True where the hypothesis is rejected at FDR q. NaN p → False."""
    p = np.asarray(p, dtype=np.float64)
    ok = ~np.isnan(p)
    pv = p[ok]
    m = pv.size
    out = np.zeros(p.shape, dtype=bool)
    if m == 0:
        return out
    order = np.argsort(pv)
    thresh = q * np.arange(1, m + 1) / m
    below = pv[order] <= thresh
    if below.any():
        k = np.max(np.where(below)[0])
        rej = np.zeros(m, dtype=bool)
        rej[order[: k + 1]] = True
        out[ok] = rej
    return out


# ─── Vectorized annual MK + Sen for the world map ───────────────────────────

def mk_sen_grid(a: np.ndarray, years: np.ndarray, chunk: int = 2000):
    """a: (cells, n_years) annual anomalies without NaN. Returns s, var_s, p, slope.

    Identical to mann_kendall / sen_slope row by row (tested)."""
    n = a.shape[1]
    i, j = np.triu_indices(n, 1)
    dt = (years[j] - years[i]).astype(np.float64)
    s_all, v_all, p_all, sl_all = [], [], [], []
    base_var = n * (n - 1) * (2 * n + 5)
    for c0 in range(0, a.shape[0], chunk):
        x = a[c0:c0 + chunk]
        d = x[:, j] - x[:, i]
        s = np.sign(d).sum(1)
        # ties per row: sort, find runs of equal values
        xs = np.sort(x, axis=1)
        eq = np.diff(xs, axis=1) == 0
        ties = np.zeros(x.shape[0])
        run = np.zeros(x.shape[0])
        for k in range(eq.shape[1]):
            run = np.where(eq[:, k], run + 1, run)
            end = ~eq[:, k] | (k == eq.shape[1] - 1)
            t = run + 1
            ties += np.where(end & (run > 0), t * (t - 1) * (2 * t + 5), 0)
            run = np.where(end, 0, run)
        v = (base_var - ties) / 18
        z = np.where(v > 0, np.where(s > 0, (s - 1), np.where(s < 0, s + 1, 0)) / np.sqrt(np.maximum(v, 1e-300)), 0)
        from scipy.special import erfc as _erfc
        p = _erfc(np.abs(z) / np.sqrt(2))
        sl = np.median(d / dt, axis=1)
        s_all.append(s); v_all.append(v); p_all.append(p); sl_all.append(sl)
    return (np.concatenate(s_all), np.concatenate(v_all), np.concatenate(p_all), np.concatenate(sl_all))


def sen_ci_grid(a: np.ndarray, years: np.ndarray, var_s: np.ndarray, chunk: int = 2000):
    """Vectorized sen_slope: returns slope, lo, hi (per year), identical to the scalar one."""
    n = a.shape[1]
    i, j = np.triu_indices(n, 1)
    dt = (years[j] - years[i]).astype(np.float64)
    t = years - years[0]
    tmed = float(np.median(t))
    out_s, out_lo, out_hi = [], [], []
    for c0 in range(0, a.shape[0], chunk):
        x = a[c0:c0 + chunk]
        sl = np.sort((x[:, j] - x[:, i]) / dt, axis=1)
        slope = np.median(sl, axis=1)
        intercept = np.median(x, axis=1) - slope * tmed
        resid = x - intercept[:, None] - slope[:, None] * t[None, :]
        d = resid - resid.mean(1, keepdims=True)
        den = (d * d).sum(1)
        r1 = np.where(den == 0, 0.0, (d[:, :-1] * d[:, 1:]).sum(1) / np.where(den == 0, 1, den))
        r1 = np.clip(r1, 0.0, 0.95)
        c = Z975 * np.sqrt(var_s[c0:c0 + chunk] * ((1 + r1) / (1 - r1)))
        m = sl.shape[1]
        m1 = np.floor((m - c) / 2 + 0.5).astype(int)
        m2 = np.floor((m + c) / 2 + 0.5).astype(int)
        rows = np.arange(x.shape[0])
        out_s.append(slope)
        out_lo.append(sl[rows, np.clip(m1 - 1, 0, m - 1)])
        out_hi.append(sl[rows, np.clip(m2, 0, m - 1)])
    return np.concatenate(out_s), np.concatenate(out_lo), np.concatenate(out_hi)


def fast_mk(x: np.ndarray) -> MK:
    """mann_kendall in O(n log n) via Kendall's tau (for 552-month series). Same result."""
    from scipy.stats import kendalltau
    x = np.asarray(x, dtype=np.float64)
    x = x[~np.isnan(x)]
    n = len(x)
    n0 = n * (n - 1) / 2
    _, t = np.unique(x, return_counts=True)
    n2 = float((t * (t - 1) / 2).sum())
    if n0 - n2 <= 0:
        return MK(n, 0.0, 0.0, 0.0, 1.0)
    tau = kendalltau(np.arange(n), x).statistic
    s = float(round(tau * sqrt(n0 * (n0 - n2))))
    v = mk_variance(x)
    z = 0.0
    if v > 0:
        z = (s - 1) / sqrt(v) if s > 0 else (s + 1) / sqrt(v) if s < 0 else 0.0
    return MK(n, s, v, z, norm_sf2(z))


def fast_prewhitened_mk(x: np.ndarray) -> MK:
    x = np.asarray(x, dtype=np.float64)
    x = x[~np.isnan(x)]
    r1 = lag1(x)
    return fast_mk(x[1:] - r1 * x[:-1])


# ─── Step 6: area weights ───────────────────────────────────────────────────

def area_weights(lat: np.ndarray, overlap: np.ndarray) -> np.ndarray:
    """Weights for a region: cos(lat) × fraction of the cell inside it, normalised to 1."""
    w = np.cos(np.radians(lat)) * overlap
    s = w.sum()
    if s <= 0:
        raise ValueError("region has no overlapping cells")
    return w / s


# ─── Grid / tile indexing (must match web/src/data.ts) ──────────────────────

def cell_of(lat: float, lon: float) -> tuple[int, int]:
    i = min(360, max(0, int(np.floor((lat + 90) / 0.5 + 0.5))))
    j = int(np.floor((lon + 180) / 0.625 + 0.5)) % 576
    return i, j


def tile_of(i: int, j: int) -> tuple[int, int]:
    return min(i // 20, 17), j // 16  # (ty, tx); top tile row holds 21 rows
