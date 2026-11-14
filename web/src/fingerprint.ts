/**
 * Climate fingerprint of a place (docs/FEATURE_PLAN.md §2): the trend of every variable
 * at once, a few fixed sentences about what they show together, and the places elsewhere
 * whose trends look most alike. Pure functions; the card is Fingerprint.tsx.
 *
 * Rules of honesty:
 *  - a sentence only fires when every variable it names has at least "possible" evidence
 *    and a change of at least MIN_RELATIVE of that variable's typical large change;
 *  - the wording says "seen together", never "causes";
 *  - the experimental variable (RUNOFF) is never part of a sentence;
 *  - similarity compares like with like: trend-map means (1980–2025) on both sides.
 *
 * Written with AI assistance (Claude).
 */
import type { TrendLevel, VarId } from "./data.ts";
import type { GridMean } from "./areaStats.ts";
import type { Lang } from "./i18n.ts";

export interface FingerprintRow {
  var: VarId;
  /** display units per decade; null = no data here (e.g. a land-only variable over the sea) */
  slope: number | null;
  level: TrendLevel;
  /** slope ÷ the variable's typical large change, clipped to ±1.5 (bar length) */
  relative: number | null;
  /** where the number comes from */
  source: "series" | "map";
}

const CLIP = 1.5;

export function relative(slope: number | null, scale: number): number | null {
  if (slope === null || !Number.isFinite(slope) || !(scale > 0)) return null;
  return Math.max(-CLIP, Math.min(CLIP, slope / scale));
}

/**
 * Evidence level of an area from the trend map: "strong" when at least half of the area has
 * strong evidence in the direction of the mean change, "possible" when strong + possible
 * cover at least half, otherwise "none".
 */
export function levelOfArea(s: GridMean): TrendLevel {
  const strongDir = s.meanSlope >= 0 ? s.strongUp : s.strongDown;
  if (strongDir >= 0.5) return "strong";
  if (strongDir + s.possible >= 0.5) return "possible";
  return "none";
}

// ── what the variables show together ─────────────────────────────────────────

type Dir = 1 | -1 | 0; // +1 rising with evidence, −1 falling with evidence, 0 no evidence

export interface Insight {
  id: string;
  text: Record<Lang, string>;
}

/**
 * Fixed rule table, checked in this order; at most two sentences are shown.
 * `need` lists variable → required direction; every one must hold (and have data).
 */
export const RULES: { id: string; need: Partial<Record<VarId, Dir>>; text: Record<Lang, string> }[] = [
  {
    id: "warm-dry",
    need: { T2M: 1, GWETROOT: -1 },
    text: { tr: "Isınma ile topraktaki kuruma birlikte görülüyor.", en: "Warming and drying soil are seen together." },
  },
  {
    id: "warm-snow",
    need: { T2M: 1, SNOMAS: -1 },
    text: { tr: "Isınırken kar örtüsü azalıyor.", en: "Snow cover is shrinking while it warms." },
  },
  {
    id: "dry-steady-rain",
    need: { GWETROOT: -1, PRECTOT: 0 },
    text: { tr: "Yağış belirgin değişmezken toprak kuruyor.", en: "The soil is drying while rainfall shows no clear change." },
  },
  {
    id: "wetting",
    need: { PRECTOT: 1, GWETROOT: 1 },
    text: { tr: "Yağış ve toprak nemi birlikte artıyor.", en: "Rainfall and soil moisture are rising together." },
  },
  {
    id: "drying",
    need: { PRECTOT: -1, GWETROOT: -1 },
    text: { tr: "Yağış ve toprak nemi birlikte azalıyor.", en: "Rainfall and soil moisture are falling together." },
  },
  {
    id: "warm-humid",
    need: { T2M: 1, QV2M: 1 },
    text: { tr: "Hava hem ısınıyor hem daha çok nem taşıyor.", en: "The air is both warming and carrying more moisture." },
  },
];

const QUIET: Insight = {
  id: "quiet",
  text: { tr: "Bu dönemde hiçbir değişkende belirgin bir değişim yok.", en: "No variable shows a clear change in this period." },
};

/** A change must also be big enough to name: at least this share of a typical large change. */
export const MIN_RELATIVE = 0.1;

function dirOf(r: FingerprintRow | undefined): Dir | null {
  if (!r || r.slope === null) return null; // no data: a rule naming it cannot fire
  if (r.level === "none") return 0;
  // statistically clear but tiny (e.g. a few mm of snow where there is hardly any): not named
  if (r.relative !== null && Math.abs(r.relative) < MIN_RELATIVE) return 0;
  return r.slope >= 0 ? 1 : -1;
}

export function interpret(rows: FingerprintRow[]): Insight[] {
  const by = new Map(rows.map((r) => [r.var, r]));
  const out: Insight[] = [];
  for (const rule of RULES) {
    const ok = Object.entries(rule.need).every(([v, want]) => {
      if (v === "RUNOFF") return false; // experimental: never part of a sentence
      return dirOf(by.get(v as VarId)) === want;
    });
    if (ok) out.push({ id: rule.id, text: rule.text });
    if (out.length === 2) break;
  }
  const withData = rows.filter((r) => r.slope !== null);
  if (!out.length && withData.length && withData.every((r) => r.level === "none")) out.push(QUIET);
  return out;
}

// ── similar places ───────────────────────────────────────────────────────────

/** Relative slopes per variable (null = no data). Built from trend-map means on both sides. */
export type Vector = Partial<Record<VarId, number | null>>;

/** Below this length nothing changes much, and the direction of the vector is noise. */
export const MIN_LENGTH = 0.3;
/** Variables both places must have data for. */
export const MIN_COMMON = 5;

export function vectorOf(means: Partial<Record<VarId, GridMean | null>>, scales: Partial<Record<VarId, number>>): Vector {
  const v: Vector = {};
  for (const [id, m] of Object.entries(means) as [VarId, GridMean | null][]) v[id] = m ? relative(m.meanSlope, scales[id] ?? 0) : null;
  return v;
}

/** Cosine similarity over the variables both have; null when it would not mean anything. */
export function similarity(a: Vector, b: Vector): number | null {
  let dot = 0, na = 0, nb = 0, common = 0;
  for (const id of Object.keys(a) as VarId[]) {
    const x = a[id], y = b[id];
    if (x === null || x === undefined || y === null || y === undefined) continue;
    dot += x * y;
    na += x * x;
    nb += y * y;
    common++;
  }
  if (common < MIN_COMMON) return null;
  if (Math.sqrt(na) < MIN_LENGTH || Math.sqrt(nb) < MIN_LENGTH) return null;
  return dot / Math.sqrt(na * nb);
}

export interface Candidate {
  kind: "country" | "province";
  id: string;
  country: string;
  name: Record<Lang, string>;
  vector: Vector;
}

/** The most alike places (similarity ≥ 0.5), best first, never the place itself. */
export function mostSimilar(self: Vector, selfId: string, pool: Candidate[], n = 5): (Candidate & { score: number })[] {
  const scored: (Candidate & { score: number })[] = [];
  for (const c of pool) {
    if (c.id === selfId) continue;
    const s = similarity(self, c.vector);
    if (s !== null && s >= 0.5) scored.push({ ...c, score: s });
  }
  return scored.sort((x, y) => y.score - x.score).slice(0, n);
}
