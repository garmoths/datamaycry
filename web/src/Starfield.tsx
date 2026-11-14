/**
 * Space behind the globe: a star field drawn once on a canvas (a few hundred stars of
 * different size, brightness and tint, a faint Milky Way band and two soft nebulae),
 * a handful of stars that twinkle, and an occasional shooting star (idea from Magic UI
 * "Meteors", ui-lab: src/components/ui/meteors.tsx, rebuilt in plain CSS).
 *
 * The sky drifts as the globe turns (moveSky, called by the map), so the Earth feels
 * like it sits in space instead of on a wallpaper. No animation loop of its own:
 * twinkle and meteors are CSS, and both stop for people who prefer reduced motion.
 *
 * Written with AI assistance (Claude).
 */
import { useEffect, useMemo, useRef } from "react";
import { setSky } from "./sky.ts";

/** Small seeded random generator, so the sky is the same on every visit. */
function rng(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

const MARGIN = 60; // extra sky above and below for the latitude shift

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

  // the pattern is drawn twice side by side, so sliding by one width loops seamlessly
  const twice = (draw: (x0: number) => void) => {
    draw(0);
    draw(w);
  };

  // nebulae: wide, very soft colour clouds
  const clouds = [
    { x: 0.18, y: 0.3, r: 0.55, c: "110, 90, 255", a: 0.1 },
    { x: 0.82, y: 0.72, r: 0.5, c: "40, 190, 210", a: 0.075 },
    { x: 0.62, y: 0.12, r: 0.35, c: "255, 120, 90", a: 0.04 },
  ];
  twice((x0) => {
    for (const n of clouds) {
      for (const dx of [-w, 0, w]) {
        const cx = x0 + n.x * w + dx;
        const g = ctx.createRadialGradient(cx, n.y * H, 0, cx, n.y * H, n.r * w);
        g.addColorStop(0, `rgba(${n.c}, ${n.a})`);
        g.addColorStop(1, `rgba(${n.c}, 0)`);
        ctx.fillStyle = g;
        ctx.fillRect(x0, 0, w, H);
      }
    }
  });

  // stars: most are faint specks, a few are bright with a soft glow
  const tints = ["255,255,255", "200,220,255", "255,236,210", "190,205,255", "255,214,190"];
  const count = Math.round((w * H) / 1500);
  const stars = Array.from({ length: count }, () => {
    // a third of the stars gather along a tilted band: the Milky Way
    const inBand = rand() < 0.36;
    const x = rand();
    const y = inBand ? 0.5 + (x - 0.5) * 0.55 + (rand() + rand() + rand() - 1.5) * 0.11 : rand();
    const m = rand();
    return { x, y, r: m > 0.985 ? 1.5 + rand() * 0.8 : m > 0.9 ? 0.9 + rand() * 0.5 : 0.3 + rand() * 0.55, a: 0.25 + rand() * 0.7, tint: tints[Math.floor(rand() * tints.length)], glow: m > 0.985 };
  });
  twice((x0) => {
    for (const s of stars) {
      const x = x0 + s.x * w;
      const y = s.y * H;
      if (s.glow) {
        const g = ctx.createRadialGradient(x, y, 0, x, y, s.r * 5);
        g.addColorStop(0, `rgba(${s.tint}, 0.35)`);
        g.addColorStop(1, `rgba(${s.tint}, 0)`);
        ctx.fillStyle = g;
        ctx.fillRect(x - s.r * 5, y - s.r * 5, s.r * 10, s.r * 10);
      }
      ctx.fillStyle = `rgba(${s.tint}, ${s.a})`;
      ctx.beginPath();
      ctx.arc(x, y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
  });
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

  // the few stars that twinkle, and the shooting stars: fixed places, staggered timing
  const twinkles = useMemo(() => {
    const rand = rng(77);
    return Array.from({ length: 34 }, () => ({ left: rand() * 100, top: rand() * 100, size: 1 + rand() * 1.2, delay: rand() * 6, dur: 2.6 + rand() * 3.4 }));
  }, []);
  const meteors = useMemo(() => {
    const rand = rng(404);
    return Array.from({ length: 4 }, (_, k) => ({ left: 15 + rand() * 80, top: rand() * 45, delay: 3 + k * 6.5 + rand() * 4, dur: 19 + rand() * 9 }));
  }, []);

  return (
    <div className="sky" ref={box} aria-hidden>
      <div className="sky-slide" ref={slide}>
        <canvas ref={canvas} style={{ marginTop: -MARGIN }} />
      </div>
      {twinkles.map((s, k) => (
        <i key={k} className="twinkle" style={{ left: `${s.left}%`, top: `${s.top}%`, width: s.size, height: s.size, animationDelay: `${s.delay}s`, animationDuration: `${s.dur}s` }} />
      ))}
      {meteors.map((m, k) => (
        <i key={k} className="meteor" style={{ left: `${m.left}%`, top: `${m.top}%`, animationDelay: `${m.delay}s`, animationDuration: `${m.dur}s` }} />
      ))}
    </div>
  );
}
