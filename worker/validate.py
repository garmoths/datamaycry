"""Validate every data file in a folder against the contract (PLAN.md L8).

Mock and real data must both pass:  uv run validate.py ../web/public/data

Written with AI assistance (Claude).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

from dmc import SCHEMA_VERSION, read_dmc, validate


def check(data_dir: Path) -> int:
    n = 0
    variables = json.loads((data_dir / "variables.json").read_text())
    validate(variables, "variables")
    months = variables["period"]["months"]
    var_ids = {v["id"] for v in variables["variables"]}
    n += 1

    index = json.loads((data_dir / "regions" / "index.json").read_text())
    validate(index, "region_index")
    n += 1

    for c in index["countries"]:
        h, d = read_dmc(data_dir / "regions" / f"{c['id']}.bin")
        validate(h, "region_header")
        assert h["country"] == c["id"], f"{c['id']}: country mismatch"
        assert h["months"] == months, f"{c['id']}: months {h['months']} != {months}"
        assert h["regions"][0] == {"id": c["id"], "level": "country"}
        listed = {a["id"] for a in c["admin1"]}
        present = {r["id"] for r in h["regions"][1:]}
        assert listed == present, f"{c['id']}: admin1 in index != in file"
        assert len(h["packing"]) == len(h["vars"])
        assert d.size == len(h["regions"]) * len(h["vars"]) * months, f"{c['id']}: payload size"
        n += 1

    if index.get("continents"):
        h, d = read_dmc(data_dir / "regions" / "continents.bin")
        validate(h, "region_header")
        assert h["country"] == "continents" and h["months"] == months
        assert [r["id"] for r in h["regions"]] == [c["id"] for c in index["continents"]]
        assert all(r["level"] == "continent" for r in h["regions"])
        assert d.size == len(h["regions"]) * len(h["vars"]) * months
        n += 1

    bf = data_dir / "regions" / "badges.json"
    if bf.exists():
        badges = json.loads(bf.read_text())
        validate(badges, "badges")
        known = {c["id"] for c in index.get("continents", [])}
        for c in index["countries"]:
            known.add(c["id"])
            known.update(a["id"] for a in c["admin1"])
        unknown = sorted(set(badges["regions"]) - known)
        assert not unknown, f"badges for unknown regions: {unknown[:5]}"
        n += 1

    ncell = 361 * 576
    for f in sorted((data_dir / "trend_map").glob("*.bin")):
        h, d = read_dmc(f)
        validate(h, "trend_map_header")
        assert f.stem == h["var"] and h["var"] in var_ids
        assert d.size == len(h["fields"]) * ncell, f"{f.name}: payload size"
        n += 1

    for f in sorted((data_dir / "anomaly_frames").glob("*.bin")):
        h, d = read_dmc(f)
        validate(h, "anomaly_frames_header")
        assert f.stem == h["var"] and h["var"] in var_ids
        g = h["grid"]
        ny = h["years"]["end"] - h["years"]["start"] + 1
        assert d.size == ny * g["nlat"] * g["nlon"], f"{f.name}: payload size"
        n += 1

    for f in sorted((data_dir / "tiles").glob("*/*.bin")):
        h, d = read_dmc(f)
        validate(h, "tile_header")
        assert f.parent.name == h["var"] and f.stem == f"{h['ty']}_{h['tx']}"
        assert h["i0"] == h["ty"] * 20 and h["j0"] == h["tx"] * 16
        assert h["nlat"] == (21 if h["ty"] == 17 else 20)
        assert d.size == h["nlat"] * h["nlon"] * h["months"], f"{f.name}: payload size"
        n += 1
    return n


if __name__ == "__main__":
    folder = Path(sys.argv[1] if len(sys.argv) > 1 else "../web/public/data")
    count = check(folder)
    print(f"OK: {count} files match contract v{SCHEMA_VERSION} in {folder}")
