"""DMC1 binary container + JSON Schema validation (contract/types.ts).

  bytes 0..3  ASCII "DMC1"
  bytes 4..7  uint32 LE header length H
  bytes 8..   UTF-8 JSON header, space-padded so 8 + H is a multiple of 8
  then        int16 LE payload

Written with AI assistance (Claude).
"""
from __future__ import annotations

import json
import struct
from pathlib import Path

import numpy as np
from jsonschema import Draft202012Validator

ROOT = Path(__file__).resolve().parent.parent
SCHEMA_DIR = ROOT / "contract" / "schema"
SCHEMA_VERSION = "1.4"
MAGIC = b"DMC1"
MISSING_INT16 = -32768


def pack(values: np.ndarray, scale: float, offset: float) -> np.ndarray:
    """Float values (display units, NaN = missing) -> int16. Errors if out of range."""
    q = np.round((values - offset) / scale)
    nan = np.isnan(q)
    finite = q[~nan]
    if finite.size and (finite.min() <= MISSING_INT16 or finite.max() > 32767):
        raise ValueError(
            f"value out of int16 range for scale={scale} offset={offset}: "
            f"{np.nanmin(values)}..{np.nanmax(values)}"
        )
    out = np.where(nan, MISSING_INT16, q).astype("<i2")
    return out


def write_dmc(path: Path, header: dict, payload: np.ndarray) -> None:
    h = json.dumps(header, ensure_ascii=False, separators=(",", ":")).encode()
    h += b" " * ((-(8 + len(h))) % 8)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "wb") as f:
        f.write(MAGIC)
        f.write(struct.pack("<I", len(h)))
        f.write(h)
        f.write(np.ascontiguousarray(payload, dtype="<i2").tobytes())


def read_dmc(path: Path) -> tuple[dict, np.ndarray]:
    buf = Path(path).read_bytes()
    if buf[:4] != MAGIC:
        raise ValueError(f"{path}: not a DMC1 file")
    (hlen,) = struct.unpack("<I", buf[4:8])
    if (8 + hlen) % 8:
        raise ValueError(f"{path}: header not padded")
    header = json.loads(buf[8 : 8 + hlen].decode())
    data = np.frombuffer(buf, dtype="<i2", offset=8 + hlen)
    return header, data


_validators: dict[str, Draft202012Validator] = {}


def validate(obj: dict, schema: str) -> None:
    if schema not in _validators:
        s = json.loads((SCHEMA_DIR / f"{schema}.schema.json").read_text())
        _validators[schema] = Draft202012Validator(s)
    errors = sorted(_validators[schema].iter_errors(obj), key=lambda e: list(e.path))
    if errors:
        msg = "; ".join(f"{'/'.join(map(str, e.path)) or '<root>'}: {e.message}" for e in errors[:5])
        raise ValueError(f"{schema}: {msg}")
