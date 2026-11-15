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
     ("How wet the soil is where plant roots are, from the driest this soil gets to fully soaked. "
      "Even deserts stay around 30%, so compare places by their change, not their level.",
      "Bitki köklerinin olduğu toprağın ıslaklığı: o toprağın en kuru halinden tamamen doygun haline kadar. "
      "Çöller bile %30 civarında kalır; yerleri seviyesiyle değil değişimiyle karşılaştır."),
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
    "SNOMAS": ("In mountains snow is shown lower than it really is: each grid square (about 50 km) averages "
               "peaks and valleys together. Use it for the direction of change, not the amount.",
               "Dağlık bölgelerde kar gerçekte olduğundan az görünür: her ızgara karesi (yaklaşık 50 km) dağları ve "
               "ovaları birlikte ortalar. Miktar için değil, değişimin yönü için kullan."),
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
    # id, name, bbox, continent, cells, provinces (id, name, lat, lon, cells) — cells from regions.py
    ("TUR", ("Turkey", "Türkiye"), [25.6, 35.8, 44.8, 42.1], "AS", 259.6, [
        ("TR-21", ("Diyarbakır", "Diyarbakır"), 37.9, 40.2, 4.96),
        ("TR-42", ("Konya", "Konya"), 37.9, 32.5, 13.2),
        ("TR-06", ("Ankara", "Ankara"), 39.9, 32.9, 8.63),
        ("TR-34", ("Istanbul", "İstanbul"), 41.0, 29.0, 1.65),
        ("TR-77", ("Yalova", "Yalova"), 40.6, 29.2, 0.23),  # low resolution example
    ]),
    ("EGY", ("Egypt", "Mısır"), [24.7, 22.0, 36.9, 31.7], "AF", 290.07, [
        ("EG-C", ("Cairo", "Kahire"), 30.0, 31.2, 0.94),
        ("EG-ASN", ("Aswan", "Asvan"), 24.1, 32.9, 4.4),
    ]),
    ("BRA", ("Brazil", "Brezilya"), [-74.0, -33.8, -34.8, 5.3], "SA", 2240.99, [
        ("BR-AM", ("Amazonas", "Amazonas"), -3.4, -65.0, 407.99),
        ("BR-SP", ("São Paulo", "São Paulo"), -22.0, -48.5, 69.74),
    ]),
]
# Continents: camera bbox for flyTo (not the data extent), cells from regions.py
CONTINENTS = [
    ("AF", ("Africa", "Afrika"), [-20, -36, 52, 38], 7807.7, 5),
    ("AN", ("Antarctica", "Antarktika"), [-180, -90, 180, -60], 18845.3, -80),
    ("AS", ("Asia", "Asya"), [26, -11, 146, 56], 9353.8, 35),
    ("EU", ("Europe", "Avrupa"), [-25, 34, 45, 72], 11808.1, 52),
    ("NA", ("North America", "Kuzey Amerika"), [-170, 7, -50, 84], 11381.3, 45),
    ("OC", ("Oceania", "Okyanusya"), [110, -48, 180, 0], 2406.4, -25),
    ("SA", ("South America", "Güney Amerika"), [-82, -56, -34, 13], 4754.6, -15),
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


def write_region_file(name: str, regions: list[dict], lats: np.ndarray) -> None:
    blocks, packing = [], []
    for k, v in enumerate(VARS):
        vals = series(len(regions), v[11], lats, seed_shift=k)
        blocks.append(pack(vals, v[6], 0))
        packing.append({"scale": v[6], "offset": 0})
    payload = np.stack(blocks, axis=1)  # [region][var][month]
    header = {
        "schema_version": SCHEMA_VERSION, "kind": "region", "country": name,
        "start": START, "months": MONTHS, "regions": regions,
        "vars": [v[0] for v in VARS], "packing": packing,
    }
    validate(header, "region_header")
    write_dmc(OUT / "regions" / f"{name}.bin", header, payload)


def write_regions() -> None:
    index = {"schema_version": SCHEMA_VERSION, "kind": "region_index", "countries": [],
             "continents": [{"id": cid, "name": {"en": n[0], "tr": n[1]}, "bbox": bbox, "cells": cells}
                            for cid, n, bbox, cells, _ in CONTINENTS]}
    for cid, cname, bbox, cont, ccells, provs in COUNTRIES:
        index["countries"].append({
            "id": cid, "name": {"en": cname[0], "tr": cname[1]}, "bbox": bbox,
            "continent": cont, "cells": ccells,
            "admin1": [{"id": pid, "name": {"en": n[0], "tr": n[1]}, "cells": cells,
                        "low_resolution": cells < 1.0} for pid, n, _, _, cells in provs],
        })
        lats = np.array([np.mean([p[2] for p in provs])] + [p[2] for p in provs])
        regions = [{"id": cid, "level": "country"}] + [{"id": p[0], "level": "admin1"} for p in provs]
        write_region_file(cid, regions, lats)
    write_region_file("continents", [{"id": c[0], "level": "continent"} for c in CONTINENTS],
                      np.array([c[4] for c in CONTINENTS], dtype=float))
    validate(index, "region_index")
    (OUT / "regions" / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=2))


def write_badges() -> None:
    """Fake badges (contract 1.3) covering every status, so the UI can be built."""
    def b(source, var, status, ours, ref, years=(1980, 2025), detail=None):
        x = {"source": source, "var": var, "status": status, "years": {"start": years[0], "end": years[1]},
             "ours": {"slopePerDecade": ours, "ci95": [ours - 0.1, ours + 0.1], "pValue": 0.001},
             "ref": {"slopePerDecade": ref, "ci95": [ref - 0.1, ref + 0.1], "pValue": 0.002}}
        if detail:
            x["detail"] = {"en": f"{detail[0]} station(s): {detail[1]}", "tr": f"{detail[0]} istasyon: {detail[1]}"}
        return x
    regions = {
        "TR-21": [b("GHCN", "T2M", "agree", 0.42, 0.55, detail=(1, "DIYARBAKIR")),
                  b("GPCP", "PRECTOT", "agree", -0.06, -0.05, (1983, 2025))],
        "TR-42": [b("GHCN", "T2M", "agree", 0.37, 0.50, detail=(1, "KONYA")),
                  b("GPCP", "PRECTOT", "disagree", 0.30, -0.25, (1983, 2025))],
        "TUR": [b("GHCN", "T2M", "agree", 0.44, 0.50, detail=(36, "RIZE, KASTAMONU, SIVAS, VAN, ISPARTA +31")),
                b("GPCP", "PRECTOT", "inconclusive", -0.01, 0.0, (1983, 2025))],
    }
    doc = {"schema_version": SCHEMA_VERSION, "kind": "badges", "regions": regions}
    validate(doc, "badges")
    (OUT / "regions" / "badges.json").write_text(json.dumps(doc, ensure_ascii=False, indent=1))


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


def write_frames_mock() -> None:
    """Fake yearly anomaly maps on a coarse 4° × 5° grid (contract 1.4), every variable."""
    from frames import write_frames
    lat = np.arange(-88, 89, 4.0)
    lon = np.arange(-177.5, 180, 5.0)
    grid = {"nlat": len(lat), "nlon": len(lon), "lat0": float(lat[0]), "lon0": float(lon[0]), "dlat": 4.0, "dlon": 5.0}
    years = np.arange(1980, 2026)
    for k, v in enumerate(VARS):
        mean, amp, trend, sd, lo = v[11]
        base = trend * (1 + np.abs(lat)[None, :, None] / 45) * (0.6 + 0.6 * np.sin(np.radians(lon)[None, None, :] * 2 + k))
        t = (years - 2005.5)[:, None, None] / 10
        frames = base * t + rng.normal(0, sd * 0.4, (len(years), len(lat), len(lon)))
        write_frames(OUT, v[0], frames.astype(np.float32), grid, (1980, 2025))


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
    # Remove only what this script writes (the map borders live in web/public/boundaries).
    OUT.mkdir(parents=True, exist_ok=True)
    for sub in ("regions", "trend_map", "tiles", "anomaly_frames"):
        if (OUT / sub).exists():
            shutil.rmtree(OUT / sub)
    (OUT / "variables.json").unlink(missing_ok=True)
    write_variables()
    write_regions()
    write_badges()
    write_trend_maps()
    write_tiles()
    write_frames_mock()
    n = check(OUT)
    size = sum(f.stat().st_size for f in OUT.rglob("*") if f.is_file())
    print(f"Mock data: {n} files, {size / 1e6:.1f} MB in {OUT} — all match contract v{SCHEMA_VERSION}")
