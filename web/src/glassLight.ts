/**
 * Pointer-following light for the glass bars: sets --mx / --my on the element under the
 * pointer (App.css draws a soft radial highlight there). Delegated from the app root, so
 * one listener serves every bar and nothing re-renders.
 * Written with AI assistance (Claude).
 */
export const GLASS = ".dock, .brand, .cmdbar, .actions, .period, .timebar";

/** --mx / --my for a pointer at (x, y) over a box: pixel position inside the box. */
export function lightPosition(x: number, y: number, box: { left: number; top: number }): { mx: string; my: string } {
  return { mx: `${Math.round(x - box.left)}px`, my: `${Math.round(y - box.top)}px` };
}

export function onGlassPointer(e: { clientX: number; clientY: number; target: EventTarget | null }) {
  const el = (e.target as Element | null)?.closest?.(GLASS) as HTMLElement | null;
  if (!el) return;
  const { mx, my } = lightPosition(e.clientX, e.clientY, el.getBoundingClientRect());
  el.style.setProperty("--mx", mx);
  el.style.setProperty("--my", my);
}
