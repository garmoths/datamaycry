"""Place names from Natural Earth, shared by regions.py (index.json) and boundaries.py.

Natural Earth leaves some names empty (NaN, which is truthy in Python) and a few small
unassigned areas have no name at all (ids like MEX+99?). A real name such as Thailand's
"Nan" province must survive, so only true missing values are skipped.
"""
from __future__ import annotations


def ok(v) -> bool:
    return isinstance(v, str) and bool(v.strip())


def place_name(candidates_en: list, tr, country: dict | None = None) -> dict:
    """{"en", "tr"}: first non-empty English candidate; unnamed areas become
    "<country> (other areas)" so no raw code is ever shown."""
    en = next((v.strip() for v in candidates_en if ok(v)), None)
    if en is None:
        c_en = (country or {}).get("en") or "Unnamed"
        c_tr = (country or {}).get("tr") or c_en
        return {"en": f"{c_en} (other areas)", "tr": f"{c_tr} (diğer alanlar)"}
    return {"en": en, "tr": tr.strip() if ok(tr) else en}
