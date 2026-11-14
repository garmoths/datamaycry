"""Mock data generator (PLAN.md §8 step 3, contract v1.0).

Writes FAKE but realistic-looking files into web/public/data so the UI can be
built before real MERRA-2 data exists. Every file is validated against the
contract at the end; the real worker must pass the same validation.

    uv run mock.py            # writes ../web/public/data and validates it

Written with AI assistance (Claude).
"""
from __future__ import annotations

import json
import shutil
from pathlib import Path

import numpy as np

from dmc import ROOT, SCHEMA_VERSION, pack, validate, write_dmc
from validate import check

OUT = ROOT / "web" / "public" / "data"
START, MONTHS = "1980-01", 561  # 1980-01 .. 2026-09
NLAT, NLON = 361, 576
GRID = {"nlat": 361, "nlon": 576, "lat0": -90, "lon0": -180, "dlat": 0.5, "dlon": 0.625}
rng = np.random.default_rng(42)  # fixed seed: same mock every run (L6)

# id, collection, unit, unit_raw, mul, add, scale, decimals, land_only, EN/TR name, EN/TR description,
# mock generator params: mean, seasonal amplitude, trend per decade, noise sd, min clip
VARS = [
    ("T2M", "M2TMNXSLV", "°C", "K", 1, -273.15, 0.01, 1, False,
     ("Air temperature", "Hava sıcaklığı"),
     ("Air temperature 2 meters above the ground.", "Yerden 2 metre yükseklikteki hava sıcaklığı."),
     (15, 10, 0.4, 0.8, None)),
    ("QV2M", "M2TMNXSLV", "g/kg", "kg/kg", 1000, 0, 0.001, 2, False,
     ("Humidity", "Nem"),
     ("How much water vapour the air holds (grams of water per kg of air).",
      "Havanın taşıdığı su buharı miktarı (1 kg havadaki gram su)."),
     (7, 3, 0.1, 0.4, 0)),
    ("SPEED", "M2TMNXFLX", "m/s", "m/s", 1, 0, 0.001, 2, False,
     ("Wind speed", "Rüzgâr hızı"),
     ("Average wind speed near the surface.", "Yüzeye yakın ortalama rüzgâr hızı."),
     (4, 0.8, -0.03, 0.3, 0)),
    ("PRECTOT", "M2TMNXFLX", "mm/day", "kg m-2 s-1", 86400, 0, 0.01, 2, False,
     ("Precipitation", "Yağış"),
     ("Rain and snow that falls, as millimetres of water per day.",
      "Yağmur ve kar olarak düşen su, günde milimetre olarak."),
     (1.5, 1.2, -0.05, 0.6, 0)),
    ("EVAP", "M2TMNXFLX", "mm/day", "kg m-2 s-1", 86400, 0, 0.001, 2, False,
     ("Evaporation", "Buharlaşma"),
     ("Water that goes from the surface into the air, mm per day.",
      "Yüzeyden havaya geçen su, günde milimetre."),
     (1.4, 1.0, 0.02, 0.3, None)),
    ("GWETROOT", "M2TMNXLND", "%", "1", 100, 0, 0.01, 1, True,
     ("Soil moisture", "Toprak nemi"),
     ("How wet the soil is where plant roots are (0% dry, 100% saturated).",
      "Bitki köklerinin olduğu topraktaki ıslaklık (%0 kuru, %100 doygun)."),
     (45, 12, -1.0, 3, 0)),
    ("RUNOFF", "M2TMNXLND", "mm/day", "kg m-2 s-1", 86400, 0, 0.02, 2, True,
     ("Surface runoff", "Yüzey akışı"),
     ("Water that flows over the ground instead of soaking in, mm per day.",
      "Toprağa sızmadan yüzeyden akıp giden su, günde milimetre."),
     (0.3, 0.3, -0.01, 0.15, 0)),
    ("SNOMAS", "M2TMNXLND", "mm", "kg m-2", 1, 0, 0.5, 0, True,
     ("Snow amount", "Kar miktarı"),
     ("Snow on the ground, as the millimetres of water it would make if melted.",
      "Yerdeki kar; eriseydi kaç milimetre su olacağı olarak."),
     (20, 30, -2.0, 8, 0)),
    ("TOTEXTTAU", "M2TMNXAER", "AOD", "1", 1, 0, 0.0005, 3, False,
     ("Aerosols (haze)", "Aerosol (pus)"),
     ("How much dust, smoke and haze block sunlight (aerosol optical depth, no unit).",
      "Toz, duman ve pusun güneş ışığını ne kadar engellediği (aerosol optik derinliği, birimsiz)."),
     (0.2, 0.08, 0.005, 0.04, 0)),
]
CAVEAT = {
    "PRECTOT": ("Reanalysis precipitation can jump when satellite observations change.",
                "Reanaliz yağış verisi, uydu gözlemleri değiştiğinde sıçrama yapabilir."),
    "TOTEXTTAU": ("Aerosol data can jump in years when new satellite observations were added.",
                  "Aerosol verisi yeni uydu gözlemlerinin eklendiği yıllarda sıçrama yapabilir."),
    "RUNOFF": ("Experimental: in some places the model's runoff is far larger than the rain that fell, "
               "more often in recent years. Trends are never marked as strong evidence.",
               "Deneysel: bazı yerlerde modelin akış değeri düşen yağıştan çok daha büyük ve bu son yıllarda "
               "daha sık. Trendler hiçbir zaman güçlü kanıt olarak işaretlenmez."),
}
# Contract 1.1: data-quality flags (see check_raw.py findings, 2026-11-14).
EXPERIMENTAL = {"RUNOFF"}
SOURCE_FIELD: dict[str, str] = {}  # PRECTOTCORR rejected after GPCP comparison (compare_precip.py)

# Mock countries: a handful of provinces each (real ids from Natural Earth / ISO 3166-2).
COUNTRIES = [
    ("TUR", ("Turkey", "Türkiye"), [25.6, 35.8, 44.8, 42.1], [
        ("TR-21", ("Diyarbakır", "Diyarbakır"), 37.9, 40.2),
        ("TR-42", ("Konya", "Konya"), 37.9, 32.5),
        ("TR-06", ("Ankara", "Ankara"), 39.9, 32.9),
        ("TR-34", ("Istanbul", "İstanbul"), 41.0, 29.0),
    ]),
    ("EGY", ("Egypt", "Mısır"), [24.7, 22.0, 36.9, 31.7], [
        ("EG-C", ("Cairo", "Kahire"), 30.0, 31.2),
        ("EG-ASN", ("Aswan", "Asvan"), 24.1, 32.9),
    ]),
    ("BRA", ("Brazil", "Brezilya"), [-74.0, -33.8, -34.8, 5.3], [
        ("BR-AM", ("Amazonas", "Amazonas"), -3.4, -65.0),
        ("BR-SP", ("São Paulo", "São Paulo"), -22.0, -48.5),
    ]),
]
# Point-mode mock tile around Diyarbakır/eastern Turkey: ty=12 (30–40°N), tx=22 (40–50°E)
MOCK_TILES = [(12, 22)]


def series(n_series: int, params, lat: np.ndarray, seed_shift: float = 0) -> np.ndarray:
    """Seasonal cycle + linear trend + AR(1) noise, shape (n_series, MONTHS)."""
    mean, amp, trend, sd, lo = params
    t = np.arange(MONTHS)
    month = t % 12
    hemi = np.sign(lat + 1e-9)[:, None]  # seasons flip south of the equator
    season = amp * np.cos(2 * np.pi * (month - 6.5) / 12)[None, :] * hemi
    local = 1 + 0.3 * np.sin(np.radians(lat) * 3 + seed_shift)[:, None]
    x = mean * local + season + trend * local * (t / 120)[None, :]
    noise = np.zeros((n_series, MONTHS))
    e = rng.normal(0, sd, (n_series, MONTHS))
    for k in range(1, MONTHS):
        noise[:, k] = 0.5 * noise[:, k - 1] + e[:, k]
    x = x + noise
    if lo is not None:
        x = np.maximum(x, lo)
    return x


def write_variables() -> None:
    out = []
    for vid, coll, unit, raw, mul, add, scale, dec, land, name, desc, _ in VARS:
        v = {
            "id": vid, "collection": coll,
            "name": {"en": name[0], "tr": name[1]},
            "description": {"en": desc[0], "tr": desc[1]},
            "unit": unit, "unit_raw": raw,
            "convert": {"mul": mul, "add": add},
            "packing": {"scale": scale, "offset": 0},
            "decimals": dec, "land_only": land,
        }
        if vid in CAVEAT:
            v["caveat"] = {"en": CAVEAT[vid][0], "tr": CAVEAT[vid][1]}
        if vid in EXPERIMENTAL:
            v["experimental"] = True
        if vid in SOURCE_FIELD:
            v["source_field"] = SOURCE_FIELD[vid]
        out.append(v)
    doc = {
        "schema_version": SCHEMA_VERSION, "kind": "variables",
        "dataset": "MOCK DATA (not real) — MERRA-2 v5.12.4 layout",
        "processed_at": "mock", "is_mock": True, "grid": GRID,
        "period": {"start": START, "end": "2026-09", "months": MONTHS},
        "test_years": {"start": 1980, "end": 2025},
        "baseline_years": {"start": 1991, "end": 2020},
        "variables": out,
    }
    validate(doc, "variables")
    (OUT / "variables.json").write_text(json.dumps(doc, ensure_ascii=False, indent=2))


def write_regions() -> None:
    index = {"schema_version": SCHEMA_VERSION, "kind": "region_index", "countries": []}
    for cid, cname, bbox, provs in COUNTRIES:
        index["countries"].append({
            "id": cid, "name": {"en": cname[0], "tr": cname[1]}, "bbox": bbox,
            "admin1": [{"id": pid, "name": {"en": n[0], "tr": n[1]}} for pid, n, _, _ in provs],
        })
        lats = np.array([np.mean([p[2] for p in provs])] + [p[2] for p in provs])
        regions = [{"id": cid, "level": "country"}] + [{"id": p[0], "level": "admin1"} for p in provs]
        blocks, packing = [], []
        for k, v in enumerate(VARS):
            vals = series(len(regions), v[11], lats, seed_shift=k)
            blocks.append(pack(vals, v[6], 0))
            packing.append({"scale": v[6], "offset": 0})
        payload = np.stack(blocks, axis=1)  # [region][var][month]
        header = {
            "schema_version": SCHEMA_VERSION, "kind": "region", "country": cid,
            "start": START, "months": MONTHS, "regions": regions,
            "vars": [v[0] for v in VARS], "packing": packing,
        }
        validate(header, "region_header")
        write_dmc(OUT / "regions" / f"{cid}.bin", header, payload)
    validate(index, "region_index")
    (OUT / "regions" / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=2))


def write_trend_maps() -> None:
    lat = np.linspace(-90, 90, NLAT)[:, None]
    lon = np.linspace(-180, 180 - 0.625, NLON)[None, :]
    for k, v in enumerate(VARS):
        trend = v[11][2]
        # Smooth fake pattern: stronger towards the poles, wavy in longitude.
        slope = trend * (1 + np.abs(lat) / 45) * (0.6 + 0.6 * np.sin(np.radians(lon) * 2 + k))
        p = np.clip(0.5 * np.exp(-np.abs(slope) / (abs(trend) + 1e-9) * 2.5), 1e-5, 1)
        level = np.where(p < 0.01, 2, np.where(p < 0.05, 1, 0)).astype(float)
        fdr = (p < 0.02).astype(float)
        sscale = max(abs(trend) * 4 / 30000, 1e-6)
        fields = [slope, p, level, fdr]
        packs = [{"scale": sscale, "offset": 0}, {"scale": 1 / 32000, "offset": 0},
                 {"scale": 1, "offset": 0}, {"scale": 1, "offset": 0}]
        payload = np.concatenate([pack(f.ravel(), pk["scale"], 0) for f, pk in zip(fields, packs)])
        header = {
            "schema_version": SCHEMA_VERSION, "kind": "trend_map", "var": v[0], "grid": GRID,
            "years": {"start": 1980, "end": 2025},
            "fields": ["slope_per_decade", "p_value", "level", "fdr"], "packing": packs,
        }
        validate(header, "trend_map_header")
        write_dmc(OUT / "trend_map" / f"{v[0]}.bin", header, payload)


def write_tiles() -> None:
    for ty, tx in MOCK_TILES:
        i0, j0 = ty * 20, tx * 16
        nlat = 21 if ty == 17 else 20
        lats = np.repeat(-90 + (i0 + np.arange(nlat)) * 0.5, 16)
        for k, v in enumerate(VARS):
            vals = series(nlat * 16, v[11], lats, seed_shift=k)
            header = {
                "schema_version": SCHEMA_VERSION, "kind": "tile", "var": v[0],
                "tx": tx, "ty": ty, "i0": i0, "j0": j0, "nlat": nlat, "nlon": 16,
                "start": START, "months": MONTHS, "packing": {"scale": v[6], "offset": 0},
            }
            validate(header, "tile_header")
            write_dmc(OUT / "tiles" / v[0] / f"{ty}_{tx}.bin", header, pack(vals, v[6], 0))


if __name__ == "__main__":
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)
    write_variables()
    write_regions()
    write_trend_maps()
    write_tiles()
    n = check(OUT)
    size = sum(f.stat().st_size for f in OUT.rglob("*") if f.is_file())
    print(f"Mock data: {n} files, {size / 1e6:.1f} MB in {OUT} — all match contract v{SCHEMA_VERSION}")
