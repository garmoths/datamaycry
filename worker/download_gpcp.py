"""Download NASA GPCP v3.3 monthly precipitation (independent check, PLAN.md L4).

GPCP merges satellites and rain gauges and is independent of MERRA-2. Only the
`sat_gauge_precip` field (mm/day) is requested via OPeNDAP: ~1 MB per month.

    uv run download_gpcp.py
"""
from __future__ import annotations

import sys
from concurrent.futures import ThreadPoolExecutor, as_completed

import earthaccess
import numpy as np
import xarray as xr

from download import RAW, opendap_url, session

OUT = RAW / "GPCPMON"


def fetch(g) -> str:
    name = g["umm"]["GranuleUR"]  # GPCPMON.3.3:GPCPMON_L3_198301_V3.3.nc4
    month = name.split("_L3_")[1][:6]
    out = OUT / f"{month}.nc4"
    if out.exists():
        return "skip"
    url = f"{opendap_url(g)}.dap.nc4?dap4.ce=/sat_gauge_precip;/lat;/lon;/time"
    for attempt in range(5):
        try:
            r = session().get(url, timeout=300)
            r.raise_for_status()
            part = out.with_suffix(".part")
            part.write_bytes(r.content)
            with xr.open_dataset(part) as ds:
                a = ds.sat_gauge_precip.values
                if a.shape[-2:] != (360, 720) or np.nanmin(a) < 0 or np.nanmax(a) > 200:
                    raise ValueError(f"{month}: bad shape or range")
            part.replace(out)
            return "ok"
        except ValueError:
            raise
        except Exception:
            if attempt == 4:
                raise
    return "ok"


def main() -> int:
    earthaccess.login(strategy="netrc")
    OUT.mkdir(parents=True, exist_ok=True)
    grans = earthaccess.search_data(short_name="GPCPMON", version="3.3", temporal=("1983-01-01", "2025-12-31"))
    print(f"GPCPMON v3.3: {len(grans)} granules")
    counts = {"ok": 0, "skip": 0}
    errors = []
    with ThreadPoolExecutor(6) as pool:
        for fut in as_completed([pool.submit(fetch, g) for g in grans]):
            try:
                counts[fut.result()] += 1
            except Exception as e:
                errors.append(str(e))
    print(f"done: new {counts['ok']}, skipped {counts['skip']}, errors {len(errors)}")
    for e in errors:
        print("  ", e)
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
