"""Download MERRA-2 monthly variables via OPeNDAP (PLAN.md §4 step 1, §8 step 6).

Only the 9 variables we need are requested from each granule, so a month of a
collection is ~0.5–1.5 MB instead of ~75 MB. Files land in data/raw/ (gitignored).

  - Resumable: a month that is already on disk and passes the checks is skipped.
  - Parallel: N threads (default 6), each with its own authenticated session.
  - Retries with backoff on network / server errors.
  - L0 integrity checks (PLAN.md §3.6): grid 361×576, physical ranges, NaN share.
  - manifest.jsonl: one line per file with SHA-256, granule name, size, time.

    uv run download.py                    # everything, 1980-01 → latest
    uv run download.py --limit 3          # first 3 months per collection (test)
    caffeinate -i uv run download.py      # keep the Mac awake

Credentials come from ~/.netrc (urs.earthdata.nasa.gov).
"""
from __future__ import annotations

import argparse
import hashlib
import json
import logging
import re
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime, timezone
from pathlib import Path

import earthaccess
import numpy as np
import xarray as xr

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
LOGS = ROOT / "data" / "logs"
VERSION = "5.12.4"

# collection → variables. Order of collections = download order.
COLLECTIONS: dict[str, list[str]] = {
    "M2TMNXSLV": ["T2M", "QV2M"],
    # PRECTOTCORR = precipitation bias-corrected with observations over land.
    "M2TMNXFLX": ["SPEED", "PRECTOT", "PRECTOTCORR", "EVAP"],
    "M2TMNXLND": ["GWETROOT", "RUNOFF", "SNOMAS"],
    "M2TMNXAER": ["TOTEXTTAU"],
}

# Physical range in RAW units (L0). Out of range → the month is rejected.
RANGES: dict[str, tuple[float, float]] = {
    "T2M": (180, 340),            # K
    "QV2M": (0, 0.05),            # kg/kg
    "SPEED": (0, 60),             # m/s
    "PRECTOT": (0, 0.01),         # kg m-2 s-1  (0.01 = 864 mm/day)
    "PRECTOTCORR": (0, 0.01),     # kg m-2 s-1
    "EVAP": (-0.001, 0.001),      # kg m-2 s-1  (can be slightly negative: dew)
    "GWETROOT": (0, 1),
    "RUNOFF": (0, 0.01),          # kg m-2 s-1
    "SNOMAS": (0, 1e6),           # kg m-2 (very large over ice sheets)
    "TOTEXTTAU": (0, 20),
}
# Expected NaN share: atmosphere 0; land variables are NaN over the ocean (~70%).
LAND_VARS = {"GWETROOT", "RUNOFF", "SNOMAS"}

log = logging.getLogger("download")
_local = threading.local()
_manifest_lock = threading.Lock()


def session():
    if not hasattr(_local, "s"):
        _local.s = earthaccess.get_requests_https_session()
    return _local.s


def opendap_url(granule) -> str:
    for u in granule["umm"].get("RelatedUrls", []):
        if "opendap.earthdata.nasa.gov" in u.get("URL", ""):
            return u["URL"]
    raise RuntimeError(f"no OPeNDAP link for {granule['umm']['GranuleUR']}")


def month_of(granule) -> str:
    name = granule["umm"]["GranuleUR"]
    m = re.search(r"\.(\d{6})\.nc4$", name)
    if not m:
        raise RuntimeError(f"cannot read month from {name}")
    return m.group(1)


def check(path: Path, variables: list[str]) -> None:
    """L0 checks. Raises ValueError with the reason if the file is not usable."""
    with xr.open_dataset(path) as ds:
        if ds.sizes.get("lat") != 361 or ds.sizes.get("lon") != 576:
            raise ValueError(f"grid {dict(ds.sizes)} is not 361×576")
        for v in variables:
            if v not in ds:
                raise ValueError(f"{v} missing")
            a = ds[v].values  # xarray turns _FillValue (1e15) into NaN
            nan = float(np.isnan(a).mean())
            if v in LAND_VARS:
                if not 0.5 < nan < 0.85:
                    raise ValueError(f"{v}: NaN share {nan:.2f} not in 0.50–0.85")
            elif nan > 0:
                raise ValueError(f"{v}: {nan:.2%} NaN, expected 0")
            lo, hi = RANGES[v]
            mn, mx = float(np.nanmin(a)), float(np.nanmax(a))
            if mn < lo or mx > hi:
                raise ValueError(f"{v}: range {mn:g}..{mx:g} outside {lo:g}..{hi:g}")


def fetch(collection: str, granule, variables: list[str], retries: int = 5) -> str:
    month = month_of(granule)
    out = RAW / collection / f"{month}.nc4"
    if out.exists():
        try:
            check(out, variables)
            return "skip"
        except Exception as e:  # corrupt or partial from an earlier run → redo
            log.warning("%s %s: existing file rejected (%s), downloading again", collection, month, e)
    out.parent.mkdir(parents=True, exist_ok=True)
    ce = ";".join(f"/{v}" for v in variables + ["lat", "lon", "time"])
    url = f"{opendap_url(granule)}.dap.nc4?dap4.ce={ce}"
    part = out.with_suffix(".part")
    for attempt in range(1, retries + 1):
        try:
            t0 = time.time()
            r = session().get(url, timeout=300)
            if r.status_code in (401, 403):
                raise PermissionError(f"HTTP {r.status_code}: check ~/.netrc and GES DISC approval")
            r.raise_for_status()
            part.write_bytes(r.content)
            check(part, variables)
            part.replace(out)
            record = {
                "collection": collection, "version": VERSION, "month": month,
                "granule": granule["umm"]["GranuleUR"], "variables": variables,
                "file": str(out.relative_to(ROOT)), "bytes": len(r.content),
                "sha256": hashlib.sha256(r.content).hexdigest(),
                "downloaded_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                "seconds": round(time.time() - t0, 2),
            }
            with _manifest_lock, open(RAW / "manifest.jsonl", "a") as f:
                f.write(json.dumps(record) + "\n")
            return "ok"
        except PermissionError:
            raise
        except ValueError as e:  # failed L0 check: data problem, do not hide it
            bad = out.with_suffix(".bad")
            if part.exists():
                part.replace(bad)
            raise ValueError(f"{collection} {month}: {e} (kept as {bad.name})") from e
        except Exception as e:
            wait = min(60, 2 ** attempt)
            log.warning("%s %s: attempt %d/%d failed (%s), retry in %ds",
                        collection, month, attempt, retries, e, wait)
            time.sleep(wait)
    raise RuntimeError(f"{collection} {month}: gave up after {retries} attempts")


def fetch_constants() -> None:
    """Time-invariant surface fractions (FRLAND etc.) for area weights and coastal cells."""
    out = RAW / "const" / "M2C0NXASM.nc4"
    if out.exists():
        return
    g = earthaccess.search_data(short_name="M2C0NXASM", version=VERSION)[0]
    url = f"{opendap_url(g)}.dap.nc4?dap4.ce=/FRLAND;/FROCEAN;/FRLAKE;/FRLANDICE;/PHIS;/lat;/lon"
    r = session().get(url, timeout=300)
    r.raise_for_status()
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(r.content)
    with xr.open_dataset(out) as ds:
        total = (ds.FRLAND + ds.FROCEAN + ds.FRLAKE + ds.FRLANDICE).values
        if ds.sizes.get("lat") != 361 or not np.allclose(total, 1, atol=1e-3):
            out.unlink()
            raise ValueError("M2C0NXASM: grid wrong or surface fractions do not sum to 1")
    log.info("constants saved: %s", out.relative_to(ROOT))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--workers", type=int, default=6)
    ap.add_argument("--limit", type=int, default=0, help="only the first N months per collection")
    ap.add_argument("--collections", nargs="*", default=list(COLLECTIONS))
    args = ap.parse_args()

    LOGS.mkdir(parents=True, exist_ok=True)
    RAW.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s",
        handlers=[logging.StreamHandler(sys.stdout), logging.FileHandler(LOGS / "download.log")],
    )
    auth = earthaccess.login(strategy="netrc")
    if not auth.authenticated:
        log.error("Earthdata login failed: check ~/.netrc")
        return 2
    fetch_constants()

    jobs = []
    for coll in args.collections:
        grans = earthaccess.search_data(
            short_name=coll, version=VERSION, temporal=("1980-01-01", date.today().isoformat()),
        )
        grans = sorted(grans, key=month_of)
        if args.limit:
            grans = grans[: args.limit]
        months = [month_of(g) for g in grans]
        log.info("%s: %d granules (%s → %s)", coll, len(grans), months[0], months[-1])
        jobs += [(coll, g, COLLECTIONS[coll]) for g in grans]

    total, done, counts, errors = len(jobs), 0, {"ok": 0, "skip": 0}, []
    t0 = time.time()
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {pool.submit(fetch, *j): j for j in jobs}
        for fut in as_completed(futures):
            coll, g, _ = futures[fut]
            done += 1
            try:
                counts[fut.result()] += 1
            except PermissionError as e:
                log.error("%s", e)
                pool.shutdown(cancel_futures=True)
                return 3
            except Exception as e:
                errors.append(str(e))
                log.error("%s", e)
            if done % 25 == 0 or done == total:
                rate = done / max(time.time() - t0, 1e-9)
                eta = (total - done) / rate / 60 if rate else 0
                log.info("progress %d/%d (new %d, skipped %d, errors %d) ~%.0f min left",
                         done, total, counts["ok"], counts["skip"], len(errors), eta)

    size = sum(f.stat().st_size for f in RAW.rglob("*.nc4")) / 1e9
    log.info("DONE in %.1f min: new %d, skipped %d, errors %d, data/raw = %.2f GB",
             (time.time() - t0) / 60, counts["ok"], counts["skip"], len(errors), size)
    for e in errors:
        log.info("  error: %s", e)
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
