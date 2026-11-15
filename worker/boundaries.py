"""Province boundaries for the globe, one file per country (map decoration, not data).

    uv run boundaries.py   → web/public/boundaries/admin1/{COUNTRY}.geojson

  - Province ids use the SAME rule as the data (regions.py province_ids): ISO 3166-2
    when valid and unique, else Natural Earth adm1_code. So a clicked province always
    finds its series in regions/{COUNTRY}.bin.
  - One file per country, loaded only when that country is opened (4,596 provinces
    in one file would be far too heavy for the first page load).
  - Geometry simplified (~1 km) and rounded to 2 decimals, like countries.geojson.
"""
from __future__ import annotations

import json

import geopandas as gpd
import shapely

from download import ROOT
from names import place_name
from regions import NE, province_ids

OUT = ROOT / "web" / "public" / "boundaries" / "admin1"
TOLERANCE = 0.01  # degrees (~1 km)



def rounded(geom: dict) -> dict:
    def r(c):
        return [round(c[0], 2), round(c[1], 2)] if isinstance(c[0], (int, float)) else [r(x) for x in c]
    return {"type": geom["type"], "coordinates": r(geom["coordinates"])}


def main() -> None:
    a1 = gpd.read_file(NE / "ne_10m_admin_1_states_provinces" / "ne_10m_admin_1_states_provinces.shp")
    a1["geometry"] = shapely.make_valid(a1.geometry.values)
    a1["rid"] = province_ids(a1)
    a1["geometry"] = a1.geometry.simplify(TOLERANCE, preserve_topology=True)
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("*.geojson"):
        old.unlink()

    # country names, for the few unnamed areas ("Mexico (other areas)")
    c0 = json.loads((OUT.parent / "countries.geojson").read_text())["features"]
    names0 = {f["properties"]["id"]: {"en": f["properties"]["name_en"], "tr": f["properties"]["name_tr"]} for f in c0}
    total = 0
    for cid, g in a1.groupby("adm0_a3"):
        feats = []
        for _, p in g.sort_values("rid").iterrows():
            if p.geometry is None or p.geometry.is_empty:
                continue
            geom = shapely.geometry.mapping(p.geometry)
            if geom["type"] == "GeometryCollection":  # make_valid can leave stray lines
                polys = [x for x in p.geometry.geoms if x.geom_type in ("Polygon", "MultiPolygon")]
                if not polys:
                    continue
                geom = shapely.geometry.mapping(shapely.unary_union(polys))
            n = place_name([p.get("name_en"), p.get("name")], p.get("name_tr"), names0.get(cid))
            feats.append({"type": "Feature",
                          "properties": {"id": p.rid, "country": cid, "name_en": n["en"], "name_tr": n["tr"]},
                          "geometry": rounded(geom)})
        path = OUT / f"{cid}.geojson"
        path.write_text(json.dumps({"type": "FeatureCollection", "features": feats},
                                   ensure_ascii=False, separators=(",", ":")))
        total += path.stat().st_size
    files = sorted(OUT.glob("*.geojson"), key=lambda f: f.stat().st_size)
    print(f"{len(files)} country files, {len(a1)} provinces, total {total / 1e6:.1f} MB; "
          f"largest {files[-1].name} {files[-1].stat().st_size / 1e6:.2f} MB, "
          f"TUR {(OUT / 'TUR.geojson').stat().st_size / 1e3:.0f} KB")


if __name__ == "__main__":
    main()
