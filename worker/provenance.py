"""Source provenance: what every number on the site was computed from.

For each dataset: provider, exact version, DOI (NASA DOIs read from the NASA CMR
catalogue, not typed by hand), licence, files, bytes, period, and one SHA-256 over
all files (sorted path + file hash), so anyone can check they have the same inputs.

    uv run provenance.py   → data/logs/provenance.json
"""
from __future__ import annotations

import glob
import hashlib
import json
from datetime import date
from pathlib import Path

import earthaccess

from download import ROOT

RAW = ROOT / "data" / "raw"
OUT = ROOT / "data" / "logs" / "provenance.json"


def digest(files: list[Path]) -> tuple[str, int]:
    h = hashlib.sha256()
    total = 0
    for f in sorted(files):
        b = f.read_bytes()
        total += len(b)
        h.update(f.relative_to(ROOT).as_posix().encode())
        h.update(hashlib.sha256(b).digest())
    return h.hexdigest(), total


def cmr_doi(short_name: str, version: str) -> dict:
    c = earthaccess.search_datasets(short_name=short_name, version=version)[0]["umm"]
    doi = c.get("DOI", {}).get("DOI")
    return {"doi": f"https://doi.org/{doi}" if doi else None, "title": c.get("EntryTitle")}


def months(files: list[Path]) -> str:
    stems = sorted(f.stem[:6] for f in files)
    return f"{stems[0][:4]}-{stems[0][4:]} → {stems[-1][:4]}-{stems[-1][4:]}"


def main() -> None:
    earthaccess.login(strategy="netrc")
    sets = []
    merra = {
        "M2TMNXSLV": "T2M, QV2M", "M2TMNXFLX": "SPEED, PRECTOT, PRECTOTCORR, EVAP",
        "M2TMNXLND": "GWETROOT, RUNOFF, SNOMAS", "M2TMNXAER": "TOTEXTTAU",
    }
    for coll, variables in merra.items():
        files = [Path(f) for f in glob.glob(str(RAW / coll / "[0-9]*.nc4"))]
        sha, size = digest(files)
        sets.append({"dataset": f"NASA MERRA-2 {coll}", "provider": "NASA GMAO / GES DISC", "version": "5.12.4",
                     **cmr_doi(coll, "5.12.4"), "variables": variables, "period": months(files),
                     "files": len(files), "bytes": size, "sha256_all": sha, "licence": "NASA open data",
                     "use": "main data"})
    const = [RAW / "const" / "M2C0NXASM.nc4"]
    sha, size = digest(const)
    sets.append({"dataset": "NASA MERRA-2 M2C0NXASM (constants)", "provider": "NASA GMAO / GES DISC", "version": "5.12.4",
                 **cmr_doi("M2C0NXASM", "5.12.4"), "variables": "FRLAND, FROCEAN, FRLAKE, FRLANDICE, PHIS",
                 "files": 1, "bytes": size, "sha256_all": sha, "licence": "NASA open data", "use": "land/ocean masks"})
    files = [Path(f) for f in glob.glob(str(RAW / "GPCPMON" / "*.nc4"))]
    sha, size = digest(files)
    sets.append({"dataset": "NASA GPCP v3.3 monthly (GPCPMON)", "provider": "NASA GES DISC", "version": "3.3",
                 **cmr_doi("GPCPMON", "3.3"), "variables": "sat_gauge_precip", "period": months(files),
                 "files": len(files), "bytes": size, "sha256_all": sha, "licence": "NASA open data",
                 "use": "independent precipitation check (badges)"})
    ghcn = sorted(glob.glob(str(RAW / "ghcn" / "x" / "*")))[0]
    files = [Path(f) for f in glob.glob(f"{ghcn}/*")]
    sha, size = digest(files)
    sets.append({"dataset": "NOAA GHCN-Monthly v4 TAVG, QC-adjusted (qcf)", "provider": "NOAA NCEI",
                 "version": Path(ghcn).name.replace("ghcnm.", ""), "doi": "https://doi.org/10.7289/V5XW4GTH",
                 "url": "https://www.ncei.noaa.gov/pub/data/ghcn/v4/", "files": len(files), "bytes": size,
                 "sha256_all": sha, "licence": "US Government public domain", "use": "station temperature check (badges)"})
    files = [RAW / "gistemp" / "GLB.Ts+dSST.csv"]
    sha, size = digest(files)
    sets.append({"dataset": "NASA GISTEMP v4 global land-ocean index", "provider": "NASA GISS", "version": "v4",
                 "url": "https://data.giss.nasa.gov/gistemp/", "citation": "GISTEMP Team; Lenssen et al. (2019), JGR Atmospheres 124",
                 "files": 1, "bytes": size, "sha256_all": sha, "licence": "NASA open data", "use": "global temperature check"})
    files = [Path(f) for f in glob.glob(str(RAW / "naturalearth" / "*" / "*.shp"))]
    sha, size = digest(files)
    sets.append({"dataset": "Natural Earth 1:10m admin-0 countries + admin-1 provinces", "provider": "Natural Earth",
                 "version": (RAW / "naturalearth" / "ne_10m_admin_1_states_provinces" /
                             "ne_10m_admin_1_states_provinces.VERSION.txt").read_text().strip(),
                 "url": "https://www.naturalearthdata.com/", "files": len(files), "bytes": size, "sha256_all": sha,
                 "licence": "Public domain", "use": "region boundaries and cell overlap"})
    doc = {"generated": date.today().isoformat(), "datasets": sets}
    OUT.write_text(json.dumps(doc, indent=2, ensure_ascii=False))
    for s in sets:
        print(f"{s['dataset']:55s} v{s['version']:18s} {s.get('doi') or s.get('url')}  files={s['files']}  "
              f"{s['bytes'] / 1e6:8.1f} MB  sha={s['sha256_all'][:12]}")
    print(f"→ {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
