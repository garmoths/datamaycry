"""Grid cell → province / country / continent overlap table (PLAN.md §3.5 step 6).

For every MERRA-2 cell and every region it touches: `frac` = share of the cell's
area inside the region. Region averages then use weight = cos(lat) × frac
(true area inside the region), normalised to 1.

  - Cells are clipped at the poles; cells on the dateline (j = 0) are split in two.
  - Province id = ISO 3166-2 when valid and unique, else Natural Earth adm1_code.
  - `cells` = how many full grid cells the region's area equals. Provinces under
    1 cell are flagged low_resolution: they show a blend of neighbouring cells.

    uv run regions.py   → data/derived/region_cells.parquet + region_meta.json
"""
from __future__ import annotations

import json
import re

import geopandas as gpd
import numpy as np
import pandas as pd
import shapely
from shapely.geometry import box

from download import ROOT
from names import place_name

NE = ROOT / "data" / "raw" / "naturalearth"
OUT = ROOT / "data" / "derived"
NLAT, NLON, DLAT, DLON = 361, 576, 0.5, 0.625
LOW_RES_CELLS = 1.0

CONTINENT_IDS = {
    "Africa": ("AF", "Africa", "Afrika"),
    "Antarctica": ("AN", "Antarctica", "Antarktika"),
    "Asia": ("AS", "Asia", "Asya"),
    "Europe": ("EU", "Europe", "Avrupa"),
    "North America": ("NA", "North America", "Kuzey Amerika"),
    "Oceania": ("OC", "Oceania", "Okyanusya"),
    "South America": ("SA", "South America", "Güney Amerika"),
}
# Camera bbox for flyTo. The data extent is useless here: overseas territories and
# Russia make Europe, Oceania and North America span -180..180.
CONTINENT_VIEW = {
    "AF": [-20, -36, 52, 38], "AN": [-180, -90, 180, -60], "AS": [26, -11, 146, 56],
    "EU": [-25, 34, 45, 72], "NA": [-170, 7, -50, 84], "OC": [110, -48, 180, 0],
    "SA": [-82, -56, -34, 13],
}


def grid_cells() -> gpd.GeoDataFrame:
    rows = []
    for i in range(NLAT):
        lat = -90 + i * DLAT
        y0, y1 = max(lat - DLAT / 2, -90), min(lat + DLAT / 2, 90)
        for j in range(NLON):
            lon = -180 + j * DLON
            x0, x1 = lon - DLON / 2, lon + DLON / 2
            if x0 < -180:  # dateline cell: split into both sides
                g = shapely.MultiPolygon([box(-180, y0, x1, y1), box(x0 + 360, y0, 180, y1)])
            else:
                g = box(x0, y0, x1, y1)
            rows.append((i * NLON + j, i, j, lat, lon, g))
    df = pd.DataFrame(rows, columns=["cell_id", "i", "j", "lat", "lon", "geometry"])
    return gpd.GeoDataFrame(df, geometry="geometry", crs="EPSG:4326")


def overlaps(cells: gpd.GeoDataFrame, regions: gpd.GeoDataFrame, id_col: str) -> pd.DataFrame:
    pairs = gpd.sjoin(cells, regions[[id_col, "geometry"]], predicate="intersects", how="inner")
    inter = shapely.intersection(
        pairs.geometry.values, regions.geometry.loc[pairs["index_right"]].values
    )
    frac = shapely.area(inter) / shapely.area(pairs.geometry.values)
    out = pd.DataFrame({"region_id": pairs[id_col].values, "cell_id": pairs.cell_id.values,
                        "lat": pairs.lat.values, "frac": frac})
    return out[out.frac > 1e-6]


def province_ids(a1: gpd.GeoDataFrame) -> pd.Series:
    iso = a1["iso_3166_2"].fillna("")
    valid = iso.str.match(r"^[A-Z]{2}-[A-Z0-9]{1,3}$")
    unique = ~iso.duplicated(keep=False)
    return iso.where(valid & unique, a1["adm1_code"])


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    a0 = gpd.read_file(NE / "ne_10m_admin_0_countries" / "ne_10m_admin_0_countries.shp")
    a1 = gpd.read_file(NE / "ne_10m_admin_1_states_provinces" / "ne_10m_admin_1_states_provinces.shp")
    a0["geometry"] = shapely.make_valid(a0.geometry.values)
    a1["geometry"] = shapely.make_valid(a1.geometry.values)
    a1["rid"] = province_ids(a1)
    assert a1.rid.is_unique, "province ids are not unique"

    cells = grid_cells()
    cell_area = np.cos(np.radians(cells.lat.values))  # relative true area of a full cell

    t1 = overlaps(cells, a1, "rid").assign(level="admin1")
    t0 = overlaps(cells, a0, "ADM0_A3").assign(level="country")
    a0c = a0[a0.CONTINENT.isin(CONTINENT_IDS)].copy()
    a0c["cont"] = a0c.CONTINENT.map(lambda c: CONTINENT_IDS[c][0])
    cont = a0c.dissolve("cont").reset_index()
    tc = overlaps(cells, cont, "cont").assign(level="continent")
    table = pd.concat([t1, t0, tc], ignore_index=True)
    table["weight"] = np.cos(np.radians(table.lat)) * table.frac
    table.to_parquet(OUT / "region_cells.parquet", index=False)

    def cells_equiv(df: pd.DataFrame) -> pd.Series:
        return df.groupby("region_id").weight.sum() / np.cos(np.radians(df.groupby("region_id").lat.mean()))

    ce1, ce0, cec = cells_equiv(t1.assign(weight=np.cos(np.radians(t1.lat)) * t1.frac)), \
        cells_equiv(t0.assign(weight=np.cos(np.radians(t0.lat)) * t0.frac)), \
        cells_equiv(tc.assign(weight=np.cos(np.radians(tc.lat)) * tc.frac))

    def name(row, col_en, col_tr, fallback, country=None):
        return place_name([row.get(col_en), row.get(fallback)], row.get(col_tr), country)

    countries = []
    for _, c in a0.sort_values("ADM0_A3").iterrows():
        cid = c.ADM0_A3
        if not re.fullmatch(r"[A-Z0-9]{3}", cid) or cid not in ce0.index:
            continue
        provs = a1[a1.adm0_a3 == cid]
        cname = name(c, "NAME_EN", "NAME_TR", "NAME")
        countries.append({
            "id": cid, "name": cname,
            "continent": CONTINENT_IDS.get(c.CONTINENT, (None,))[0],
            "bbox": [round(float(v), 3) for v in c.geometry.bounds],
            "cells": round(float(ce0[cid]), 2),
            "admin1": [{
                "id": p.rid, "name": name(p, "name_en", "name_tr", "name", cname),
                "cells": round(float(ce1.get(p.rid, 0.0)), 3),
                "low_resolution": bool(ce1.get(p.rid, 0.0) < LOW_RES_CELLS),
            } for _, p in provs.sort_values("rid").iterrows()],
        })
    continents = [{"id": k, "name": {"en": en, "tr": tr},
                   "bbox": CONTINENT_VIEW[k],
                   "cells": round(float(cec.get(k, 0)), 1)}
                  for _, (k, en, tr) in CONTINENT_IDS.items()]
    (OUT / "region_meta.json").write_text(json.dumps({"continents": continents, "countries": countries},
                                                     ensure_ascii=False, indent=1))

    n_prov = sum(len(c["admin1"]) for c in countries)
    low = [(c["id"], p["id"], p["name"]["en"], p["cells"]) for c in countries for p in c["admin1"] if p["low_resolution"]]
    zero = [x for x in low if x[3] == 0]
    print(f"cells: {len(cells)}, overlap rows: admin1 {len(t1)}, country {len(t0)}, continent {len(tc)}")
    print(f"countries {len(countries)}, provinces {n_prov}, low-resolution provinces {len(low)} "
          f"({len(low) / n_prov:.0%}), with no cell at all {len(zero)}")


if __name__ == "__main__":
    main()
