/**
 * All variables' world trend maps together (docs/FEATURE_PLAN.md §1.1), for the
 * fingerprint, similar places and rankings. Loaded only when one of those is opened
 * (9 × 1.7 MB), through data.ts like every other read, and kept in memory.
 *
 * Written with AI assistance (Claude).
 */
import { getTrendMap, type TrendMap, type VarId } from "./data.ts";

export type TrendStack = Partial<Record<VarId, TrendMap>>;

let stack: Promise<TrendStack> | undefined;

/** Every listed variable's trend map; a variable whose file fails is simply left out. */
export function loadTrendStack(vars: VarId[]): Promise<TrendStack> {
  stack ??= Promise.all(vars.map((v) => getTrendMap(v).then((m) => [v, m] as const, () => null))).then((pairs) => {
    const out: TrendStack = {};
    for (const p of pairs) if (p) out[p[0]] = p[1];
    return out;
  });
  return stack;
}

/**
 * A typical "large" change for each variable: the 95th percentile of |slope| over every
 * cell with data. Dividing by it makes °C, mm/day and kg/m² comparable (FEATURE_PLAN §2.3).
 */
export function scaleOf(map: TrendMap): number {
  // a map never changes once loaded: sort its ~70 000 slopes only once
  const hit = scaleCache.get(map);
  if (hit !== undefined) return hit;
  const out = scaleOfUncached(map);
  scaleCache.set(map, out);
  return out;
}
const scaleCache = new WeakMap<TrendMap, number>();

function scaleOfUncached(map: TrendMap): number {
  const v: number[] = [];
  for (let k = 0; k < map.slopePerDecade.length; k += 3) {
    const s = map.slopePerDecade[k];
    if (map.level[k] !== 255 && Number.isFinite(s)) v.push(Math.abs(s));
  }
  if (!v.length) return 1;
  v.sort((a, b) => a - b);
  return v[Math.floor(v.length * 0.95)] || 1;
}
