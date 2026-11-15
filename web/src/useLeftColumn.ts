/**
 * Keeps the left column in one line: the period card is as wide as the logo + view switch
 * above it, and the variable rail starts right under whatever sits there: the period card,
 * or the big year label that replaces it while time travel plays (instead of being centred
 * on the screen, where it covered them on shorter screens).
 * Writes --left-w and --left-bottom on `.app`; responsive.css uses them.
 * Written with AI assistance (Claude).
 */
import { useEffect } from "react";

/** `yearLabel`: true while the time travel year label is shown instead of the period card */
export function useLeftColumn(ready: boolean, yearLabel: boolean): void {
  useEffect(() => {
    if (!ready) return;
    const app = document.querySelector<HTMLElement>(".app");
    const brand = document.querySelector<HTMLElement>(".brand");
    const above = document.querySelector<HTMLElement>(yearLabel ? ".yearbadge" : ".period");
    if (!app || !brand || !above) return;
    const sync = () => {
      const top = app.getBoundingClientRect().top;
      app.style.setProperty("--left-w", `${Math.round(brand.getBoundingClientRect().width)}px`);
      app.style.setProperty("--left-bottom", `${Math.round(above.getBoundingClientRect().bottom - top)}px`);
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(brand);
    ro.observe(above);
    window.addEventListener("resize", sync);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", sync);
    };
  }, [ready, yearLabel]);
}
