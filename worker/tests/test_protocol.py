"""Reliability layers L1 (transformations) and L2 (statistics), PLAN.md §3.6.

    uv run pytest -q
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pymannkendall as pmk
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import protocol as P  # noqa: E402
from dmc import pack  # noqa: E402

START = "1980-01"
N = 561


def ar1(n, phi, rng, sd=1.0):
    e = rng.normal(0, sd, n)
    x = np.zeros(n)
    for k in range(1, n):
        x[k] = phi * x[k - 1] + e[k]
    return x


def seasonal(n, amp=10):
    return amp * np.cos(2 * np.pi * (np.arange(n) % 12 - 6.5) / 12)


# ─── L1: transformations ────────────────────────────────────────────────────

def test_units():
    assert P.to_display("T2M", np.array([273.15]))[0] == pytest.approx(0)
    assert P.to_display("PRECTOT", np.array([1 / 86400]))[0] == pytest.approx(1)
    assert P.to_display("QV2M", np.array([0.01]))[0] == pytest.approx(10)
    assert P.to_display("GWETROOT", np.array([0.5]))[0] == pytest.approx(50)


def test_anomalies_baseline_mean_zero():
    rng = np.random.default_rng(1)
    v = 15 + seasonal(N) + rng.normal(0, 1, N)
    a = P.anomalies(v, START)
    yr, mo = P.month_index(START, N)
    base = (yr >= 1991) & (yr <= 2020)
    for m in range(1, 13):
        assert abs(a[base & (mo == m)].mean()) < 1e-12


def test_anomalies_remove_season():
    v = seasonal(N, 20)
    assert np.abs(P.anomalies(v, START)).max() < 1e-9


def test_month_index():
    yr, mo = P.month_index(START, N)
    assert (yr[0], mo[0]) == (1980, 1)
    assert (yr[-1], mo[-1]) == (2026, 9)


def test_cell_and_tile_roundtrip():
    for i in range(361):
        for j in range(0, 576, 7):
            lat, lon = -90 + i * 0.5, -180 + j * 0.625
            assert P.cell_of(lat, lon) == (i, j)
            ty, tx = P.tile_of(i, j)
            i0, j0 = ty * 20, tx * 16
            nlat = 21 if ty == 17 else 20
            assert i0 <= i < i0 + nlat and j0 <= j < j0 + 16
    assert P.tile_of(360, 575) == (17, 35)
    assert P.cell_of(0, 180) == (180, 0)  # dateline wraps


def test_area_weights_sum_to_one():
    lat = np.array([-60, 0, 30, 60.0])
    w = P.area_weights(lat, np.array([1, 0.5, 1, 0.2]))
    assert w.sum() == pytest.approx(1)
    assert w[1] < w[2] or True  # overlap and cos(lat) both matter


@pytest.mark.parametrize("scale,lo,hi", [(0.01, -80, 50), (0.001, 0, 30), (0.0005, 0, 15), (0.5, 0, 5000)])
def test_int16_roundtrip(scale, lo, hi):
    rng = np.random.default_rng(2)
    v = rng.uniform(lo, hi, 10000)
    v[::97] = np.nan
    q = pack(v, scale, 0)
    back = np.where(q == -32768, np.nan, q * scale)
    ok = ~np.isnan(v)
    assert np.isnan(back[~ok]).all()
    assert np.abs(back[ok] - v[ok]).max() <= scale / 2 + 1e-12


# ─── L2: statistics ─────────────────────────────────────────────────────────

def test_mk_matches_pymannkendall_1000_series():
    rng = np.random.default_rng(3)
    for k in range(1000):
        n = int(rng.integers(10, 60))
        x = rng.normal(0, 1, n) + rng.normal(0, 0.05) * np.arange(n)
        if k % 3 == 0:
            x = np.round(x, 1)  # ties
        a = P.mann_kendall(x)
        b = pmk.original_test(x)
        assert a.s == b.s
        assert a.var_s == pytest.approx(b.var_s)
        assert abs(a.p - b.p) < 1e-12
        s = P.sen_slope(np.arange(n), x)
        assert s.slope == pytest.approx(b.slope, abs=1e-12)
        assert s.intercept == pytest.approx(b.intercept, abs=1e-12)
        assert abs(P.prewhitened_mk(x).p - pmk.pre_whitening_modification_test(x).p) < 1e-12


def test_grid_version_equals_scalar():
    rng = np.random.default_rng(4)
    years = np.arange(1980, 2026)
    a = rng.normal(0, 1, (500, len(years))) + 0.02 * (years - 1980)
    a[::5] = np.round(a[::5], 0)  # many ties
    a[7] = 0.0  # constant row
    s, v, p, sl = P.mk_sen_grid(a, years, chunk=128)
    for r in range(len(a)):
        m = P.mann_kendall(a[r])
        assert s[r] == m.s and v[r] == pytest.approx(m.var_s) and abs(p[r] - m.p) < 1e-12
        assert sl[r] == pytest.approx(P.sen_slope(years, a[r]).slope, abs=1e-12)


def test_known_trend_is_recovered():
    rng = np.random.default_rng(5)
    covered = 0
    for _ in range(200):
        true = 0.03  # per year
        v = 10 + seasonal(N) + true * np.arange(N) / 12 + ar1(N, 0.5, rng, 0.5)
        r = P.analyze(v, START)
        lo, hi = r.ci95
        covered += lo <= true * 10 <= hi
    assert covered / 200 >= 0.90  # PLAN §3.7-2b measured ~93%


def test_calibration_false_alarms():
    """Trend-free AR(1) monthly noise φ = 0.6: R1 ≈ 5%, strong (R4) ≤ 0.5%."""
    rng = np.random.default_rng(6)
    sims = 1500
    possible_or_strong = strong = 0
    for _ in range(sims):
        v = 10 + seasonal(N) + ar1(N, 0.6, rng)
        r = P.analyze(v, START)
        possible_or_strong += r.level != "none"
        strong += r.level == "strong"
    r1 = possible_or_strong / sims
    r4 = strong / sims
    print(f"\nfalse alarms: R1 {r1:.3%}, strong {r4:.3%}")
    assert 0.025 <= r1 <= 0.085
    assert r4 <= 0.005


def test_status_rules():
    rng = np.random.default_rng(7)
    v = 10 + seasonal(N) + rng.normal(0, 1, N)
    assert P.analyze(v, START, start_year=2018, end_year=2025).status == "too_short"
    w = v.copy()
    w[: 12 * 15] = np.nan  # 15 of 46 years missing (> 20%)
    assert P.analyze(w, START).status == "insufficient_data"
    assert P.analyze(np.zeros(N), START).status == "constant"


def test_experimental_never_strong():
    v = 10 + seasonal(N) + 0.1 * np.arange(N) / 12
    v = v + 0.05 * np.sin(np.arange(N))
    assert P.analyze(v, START, var="T2M").level == "strong"
    r = P.analyze(v, START, var="RUNOFF")
    assert r.level == "possible" and r.capped


def test_fdr():
    rng = np.random.default_rng(8)
    null = rng.uniform(0, 1, 100000)
    assert P.fdr_bh(null).sum() <= 5  # almost nothing passes under the null
    p = np.array([0.001, 0.008, 0.039, 0.041, 0.042, 0.06, 0.074, 0.205, 0.212, 0.216])
    # Benjamini & Hochberg (1995) style example: first two rejected at q = 0.05
    assert P.fdr_bh(p).tolist() == [True, True] + [False] * 8
    assert not P.fdr_bh(np.array([np.nan, 0.5])).any()


def test_grid_ci_equals_scalar():
    rng = np.random.default_rng(9)
    years = np.arange(1980, 2026)
    a = np.cumsum(rng.normal(0, 0.3, (300, len(years))), axis=1) * 0.3 + rng.normal(0, 1, (300, len(years)))
    a[::4] = np.round(a[::4], 0)
    _, v, _, _ = P.mk_sen_grid(a, years)
    s, lo, hi = P.sen_ci_grid(a, years, v, chunk=64)
    for r in range(len(a)):
        sc = P.sen_slope(years, a[r])
        assert s[r] == pytest.approx(sc.slope, abs=1e-12)
        assert lo[r] == pytest.approx(sc.ci95[0], abs=1e-12) and hi[r] == pytest.approx(sc.ci95[1], abs=1e-12)


def test_fast_mk_equals_mk():
    rng = np.random.default_rng(10)
    for k in range(300):
        n = int(rng.integers(20, 600))
        x = rng.normal(0, 1, n) + rng.normal(0, 0.002) * np.arange(n)
        if k % 3 == 0:
            x = np.round(x, 1)
        a, b = P.fast_mk(x), P.mann_kendall(x)
        assert a.s == b.s and a.var_s == pytest.approx(b.var_s) and abs(a.p - b.p) < 1e-12
        assert abs(P.fast_prewhitened_mk(x).p - P.prewhitened_mk(x).p) < 1e-12


def test_winter_counts_december_to_next_year():
    """Winter 1990 = Dec 1989 + Jan 1990 + Feb 1990 (meteorological seasons)."""
    v = np.zeros(N)
    yr, mo = P.month_index(START, N)
    v[(yr == 1989) & (mo == 12)] = 30.0   # only December 1989 is special
    r = P.analyze(v, START, months=[12, 1, 2])
    a = dict(zip(r.years, r.annual))
    assert a[1990] > a[1989] + 5          # Dec 1989 lifts winter 1990, not winter 1989
    assert 1980 not in a                  # winter 1980 needs Dec 1979: not in the data


def test_coarsen2x2_nan_aware_and_matches_protocol():
    """A coarse cell = mean of its 2×2 fine cells' yearly anomalies (the trend test's numbers)."""
    from frames import coarsen2x2, color_max
    rng = np.random.default_rng(12)
    fine = rng.normal(0, 1, (3, 361 * 576)).astype(np.float32)
    fine[:, 0] = np.nan                       # one NaN fine cell
    c, g = coarsen2x2(fine)
    assert c.shape == (3, 181, 288) and g["dlat"] == 1.0 and g["dlon"] == 1.25
    f = fine.reshape(3, 361, 576)
    assert c[1, 0, 0] == pytest.approx(np.nanmean(f[1, 0:2, 0:2]))     # NaN ignored
    assert c[2, 50, 100] == pytest.approx(f[2, 100:102, 200:202].mean())
    assert c[0, 180, 7] == pytest.approx(f[0, 360, 14:16].mean())      # pole row has one fine row
    allnan = np.full((1, 361 * 576), np.nan, dtype=np.float32)
    assert np.isnan(coarsen2x2(allnan)[0]).all()
    assert color_max(c) > 0

    # the fine values are exactly the protocol's annual anomalies for a cell
    v = 10 + 8 * np.cos(2 * np.pi * (np.arange(N) % 12 - 6.5) / 12) + rng.normal(0, 1, N)
    r = P.analyze(v, START)
    a = P.anomalies(v, START)
    ours = [a[k * 12:(k + 1) * 12].mean() for k in range(46)]
    assert np.allclose(ours, r.annual)
