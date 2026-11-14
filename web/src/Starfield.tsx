/**
 * Space behind the globe: a quiet, static star field drawn once on a canvas.
 *
 * Kept deliberately plain, like a photograph of the night sky rather than an effect:
 * sparse stars, mostly faint, neutral white with the slight warm/cool spread real stars
 * have, a handful a little brighter — no nebulae, no glow halos, no twinkling, no
 * shooting stars. Star brightness follows a steep power law (many faint, few bright),
 * which is what makes a star field read as real.
 *
 * The sky drifts slowly as the globe turns (moveSky, called by the map), so the Earth
 * sits in space instead of on a wallpaper. Nothing animates on its own.
 *
 * Written with AI assistance (Claude).
 */
import { useEffect, useRef } from "react";
import { setSky } from "./sky.ts";

/** Small seeded random generator, so the sky is the same on every visit. */
function rng(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

const MARGIN = 60; // extra sky above and below for the latitude shift

/** Near-white star colours: most neutral, a few slightly warm or slightly cool. */
const TINTS = ["255,255,255", "255,255,255", "255,255,255", "236,242,255", "255,246,234"];

function paint(canvas: HTMLCanvasElement, w: number, h: number) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const H = h + 2 * MARGIN;
  canvas.width = Math.round(2 * w * dpr);
  canvas.height = Math.round(H * dpr);
  canvas.style.width = `${2 * w}px`;
  canvas.style.height = `${H}px`;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  const rand = rng(20261114);

  const count = Math.round((w * H) / 3800);
  const stars = Array.from({ length: count }, () => {
    // brightness ~ power law: m in 0…1 → mostly faint, very few bright
    const m = Math.pow(rand(), 3.2);
    return {
      x: rand(),
      y: rand(),
      r: 0.35 + m * 0.85,
      a: 0.12 + m * 0.6,
      tint: TINTS[Math.floor(rand() * TINTS.length)],
    };
  });
  // the pattern is drawn twice side by side, so sliding by one width loops seamlessly
  for (const x0 of [0, w])
    for (const s of stars) {
      ctx.fillStyle = `rgba(${s.tint}, ${s.a.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(x0 + s.x * w, s.y * H, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
}

export function Starfield() {
  const box = useRef<HTMLDivElement>(null);
  const slide = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = box.current;
    if (!el || !canvas.current) return;
    let timer = 0;
    const redraw = () => {
      const { width, height } = el.getBoundingClientRect();
      if (!width || !height || !canvas.current) return;
      paint(canvas.current, width, height);
      setSky(slide.current, width);
    };
    redraw();
    const ro = new ResizeObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(redraw, 150);
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      window.clearTimeout(timer);
      setSky(null, 0);
    };
  }, []);

  return (
    <div className="sky" ref={box} aria-hidden>
      <div className="sky-slide" ref={slide}>
        <canvas ref={canvas} style={{ marginTop: -MARGIN }} />
      </div>
    </div>
  );
}
