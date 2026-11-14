"""Reference values from pymannkendall for the JS parity test (PLAN.md L2).

    uv run python tests/make_parity_fixture.py

Written with AI assistance (Claude).
"""
import json
from pathlib import Path

import numpy as np
import pymannkendall as mk

rng = np.random.default_rng(7)
cases = []
for k in range(40):
    n = int(rng.integers(12, 60))
    x = rng.normal(0, 1, n) + rng.normal(0, 0.05) * np.arange(n)
    if k % 4 == 0:  # ties, like snow = 0 or rounded values
        x = np.round(x, 0)
    if k % 7 == 0:
        x[: n // 3] = 0.0
    o = mk.original_test(x)
    pw = mk.pre_whitening_modification_test(x)
    cases.append({
        "x": x.tolist(),
        "s": float(o.s), "var_s": float(o.var_s), "p": float(o.p),
        "slope": float(o.slope), "intercept": float(o.intercept),
        "pw_p": float(pw.p),
    })
out = Path(__file__).resolve().parents[2] / "web" / "src" / "__fixtures__" / "mk_parity.json"
out.write_text(json.dumps(cases))
print(f"wrote {len(cases)} cases to {out}")
