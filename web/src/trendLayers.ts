/**
 * Which of the two trend raster layers are drawn (and therefore load tiles).
 * One layer is on screen ("front"); the other only loads while a new map is coming
 * ("loading") and, after the cross-fade, the old one stays drawn until it has faded out
 * ("fading"). Every other layer is hidden: a hidden layer loads no tiles, so zooming does
 * not paint each tile twice. Pure logic, no MapLibre (trendLayers.test.ts).
 * Written with AI assistance (Claude).
 */
export interface TrendLayerState {
  front: string | null;
  loading: string | null;
  fading: string | null;
}

export const EMPTY_STATE: TrendLayerState = { front: null, loading: null, fading: null };

/** A new map arrives: it loads in the layer that is not on screen. */
export function startLoad(layers: readonly string[], s: TrendLayerState): { state: TrendLayerState; back: string } {
  const back = layers.find((l) => l !== s.front) ?? layers[0];
  return { state: { ...s, loading: back, fading: s.fading === back ? null : s.fading }, back };
}

/** The new map is loaded: it becomes the front, the old front fades out. */
export function finishLoad(s: TrendLayerState): TrendLayerState {
  if (!s.loading) return s;
  return { front: s.loading, loading: null, fading: s.front };
}

/** The fade-out is over: the old layer can stop drawing. */
export function endFade(s: TrendLayerState): TrendLayerState {
  return { ...s, fading: null };
}

/** Layout visibility per layer. `on` = the trend map is wanted at all. */
export function visibility(layers: readonly string[], s: TrendLayerState, on: boolean): Record<string, "visible" | "none"> {
  const out: Record<string, "visible" | "none"> = {};
  for (const l of layers) out[l] = on && (l === s.front || l === s.loading || l === s.fading) ? "visible" : "none";
  return out;
}
