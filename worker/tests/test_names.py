"""Place names: real names kept, missing ones skipped, unnamed areas get the country."""
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from names import place_name  # noqa: E402


def test_real_name_nan_is_kept():
    assert place_name(["Nan"], "Nan ili") == {"en": "Nan", "tr": "Nan ili"}


def test_missing_values_are_skipped():
    assert place_name([math.nan, "Blowing Point"], math.nan) == {"en": "Blowing Point", "tr": "Blowing Point"}


def test_unnamed_area_uses_the_country():
    n = place_name([math.nan, None, ""], math.nan, {"en": "Mexico", "tr": "Meksika"})
    assert n == {"en": "Mexico (other areas)", "tr": "Meksika (diğer alanlar)"}
