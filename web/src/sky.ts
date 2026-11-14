/**
 * Link between the globe and the star field behind it (Starfield.tsx): the map reports its
 * camera here and the sky slides with it, so the Earth feels like it sits in space.
 * Written with AI assistance (Claude).
 */
let layer: HTMLElement | null = null;
let period = 0;

/** The element to slide and the width after which its pattern repeats. */
export function setSky(el: HTMLElement | null, width: number): void {
  layer = el;
  period = width;
}

/** Called on every camera move: sideways with longitude, a little up and down with latitude. */
export function moveSky(lng: number, lat: number): void {
  if (!layer || !period) return;
  const turn = (((lng / 540) % 1) + 1) % 1; // one sky width per 1.5 turns of the globe
  layer.style.transform = `translate3d(${(-turn * period).toFixed(1)}px, ${(lat * 0.5).toFixed(1)}px, 0)`;
}
