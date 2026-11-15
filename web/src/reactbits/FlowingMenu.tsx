/**
 * React Bits "FlowingMenu" (reactbits.dev, MIT; fetched with the ui-lab stack, TS-CSS variant).
 * The part kept is its band engine: a light band glides between the rows, its top and bottom
 * edges on two springs of different stiffness so it stretches as it travels and leans toward
 * the pointer ("magnet"), and every row shows an inverted copy of itself where the band covers
 * it (clip-path). Changes from the original: no marquee, images or intro sweep; each row shows
 * our own content (index, title, a line, a value); a row with details opens them in place
 * under it (motion height), and the band rests on the open row when the pointer leaves; @hugeicons replaced by the project's Icon; plain CSS in reactbits.css
 * (.fm-*). Reduced motion: the band jumps instead of gliding.
 */
import { useEffect, useLayoutEffect, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Icon, type IconName } from "../icons.tsx";
import "./flowingmenu.css";

export interface FlowItem {
  id: string;
  icon: IconName;
  title: ReactNode;
  /** a short line under the title */
  sub?: ReactNode;
  /** the answer on the right (a value with its unit) */
  value?: ReactNode;
  /** larger content under the title (the first row: verdict, number, small chart) */
  feature?: ReactNode;
  /** details, opened in place under the row */
  content?: ReactNode;
  onClick: () => void;
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const reducedMotion = () => typeof window !== "undefined" && (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);

interface Metric {
  top: number;
  height: number;
}

export function FlowingMenu({ items, active, label, duration = 0.42, stretch = 0.3, magnet = 0.08 }: {
  items: FlowItem[];
  /** the row whose details are open: the band rests there */
  active: string | null;
  label: string;
  duration?: number;
  stretch?: number;
  magnet?: number;
}) {
  const listRef = useRef<HTMLUListElement>(null);
  const rows = useRef<{ item: HTMLLIElement | null; head: HTMLDivElement | null; band: HTMLDivElement | null }[]>([]);
  const reduce = useReducedMotion();
  const metrics = useRef<(Metric | null)[]>([]);
  const band = useRef({ top: 0, bottom: 0, vTop: 0, vBottom: 0, toTop: 0, toBottom: 0, lead: 1, shown: false, index: -1, rest: 0 });
  const cursorY = useRef<number | null>(null);
  const loop = useRef({ raf: 0, last: 0 });
  const opts = useRef({ duration, stretch, magnet });
  opts.current = { duration, stretch, magnet };
  const activeIndex = items.findIndex((x) => x.id === active);
  const activeRef = useRef(activeIndex);
  activeRef.current = activeIndex;

  const paint = () => {
    const b = band.current;
    rows.current.forEach((row, k) => {
      const m = metrics.current[k];
      if (!row?.band || !m) return;
      const from = Math.max(b.top, m.top);
      const to = Math.min(b.bottom, m.top + m.height);
      if (!b.shown || to - from < 0.25) {
        row.band.style.visibility = "hidden";
        return;
      }
      row.band.style.visibility = "visible";
      const topR = b.top >= m.top - 0.5 ? 12 : 0;
      const botR = b.bottom <= m.top + m.height + 0.5 ? 12 : 0;
      row.band.style.clipPath = `inset(${(b.top - m.top).toFixed(2)}px 0px ${(m.top + m.height - b.bottom).toFixed(2)}px 0px round ${topR}px ${topR}px ${botR}px ${botR}px)`;
    });
  };

  const frame = (now: number) => {
    const l = loop.current;
    l.raf = 0;
    const o = opts.current;
    const b = band.current;
    const reduced = reducedMotion();
    const elapsed = clamp((now - l.last) / 1000, 0, 1 / 20);
    l.last = now;
    let busy = false;
    if (b.shown) {
      const cur = b.index >= 0 ? metrics.current[b.index] : null;
      if (cur) {
        const y = cursorY.current;
        const lean = y === null || reduced ? 0 : clamp((y - (cur.top + cur.height / 2)) * o.magnet, -cur.height * 0.25, cur.height * 0.25);
        b.toTop = cur.top + lean;
        b.toBottom = cur.top + cur.height + lean;
      } else if (b.index < 0) b.toTop = b.toBottom = b.rest;
      const gap = (b.toTop + b.toBottom) / 2 - (b.top + b.bottom) / 2;
      if (Math.abs(gap) > 2) b.lead = gap > 0 ? 1 : -1;
      if (reduced) {
        b.top = b.toTop;
        b.bottom = b.toBottom;
        b.vTop = b.vBottom = 0;
      } else {
        // two damped springs: the leading edge is stiffer, so the band stretches as it moves
        const omega = (Math.PI * 2) / o.duration;
        const fast = omega * (1 + 1.1 * o.stretch);
        const slow = omega * (1 - 0.4 * o.stretch);
        const zeta = 1 - 0.3 * o.stretch;
        const wTop = b.lead > 0 ? slow : fast;
        const wBottom = b.lead > 0 ? fast : slow;
        const steps = Math.max(1, Math.ceil(elapsed / (1 / 240)));
        const dt = elapsed / steps;
        for (let i = 0; i < steps; i++) {
          b.vTop += (-wTop * wTop * (b.top - b.toTop) - 2 * zeta * wTop * b.vTop) * dt;
          b.vBottom += (-wBottom * wBottom * (b.bottom - b.toBottom) - 2 * zeta * wBottom * b.vBottom) * dt;
          b.top += b.vTop * dt;
          b.bottom += b.vBottom * dt;
          if (b.bottom < b.top) {
            const mid = (b.top + b.bottom) / 2;
            const v = (b.vTop + b.vBottom) / 2;
            b.top = b.bottom = mid;
            b.vTop = b.vBottom = v;
          }
        }
      }
      const resting = Math.abs(b.top - b.toTop) < 0.1 && Math.abs(b.bottom - b.toBottom) < 0.1 && Math.abs(b.vTop) < 2 && Math.abs(b.vBottom) < 2;
      if (resting) {
        b.top = b.toTop;
        b.bottom = b.toBottom;
        b.vTop = b.vBottom = 0;
        if (b.index < 0 && b.bottom - b.top < 0.5) b.shown = false;
      } else busy = true;
    }
    paint();
    if (busy) l.raf = requestAnimationFrame(frame);
  };
  const kick = () => {
    const l = loop.current;
    if (l.raf) return;
    l.last = performance.now();
    l.raf = requestAnimationFrame(frame);
  };

  const goTo = (k: number, from: "top" | "bottom" | "center") => {
    const m = metrics.current[k];
    if (!m) return;
    const b = band.current;
    const top = m.top, bottom = m.top + m.height;
    if (!b.shown) {
      const start = from === "bottom" ? bottom : from === "center" ? (top + bottom) / 2 : top;
      b.top = b.bottom = start;
      b.vTop = b.vBottom = 0;
      b.shown = true;
    }
    const shift = (top + bottom) / 2 - (b.top + b.bottom) / 2;
    b.lead = Math.abs(shift) > 0.5 ? (shift > 0 ? 1 : -1) : from === "bottom" ? -1 : 1;
    b.toTop = top;
    b.toBottom = bottom;
    b.index = k;
    rows.current.forEach((r, i) => r.item?.toggleAttribute("data-current", i === k));
    kick();
  };
  const release = (toward: "top" | "bottom") => {
    // the open topic keeps the band
    if (activeRef.current >= 0) return goTo(activeRef.current, toward);
    const b = band.current;
    if (!b.shown) return;
    const point = toward === "top" ? b.toTop : b.toBottom;
    b.lead = toward === "top" ? -1 : 1;
    b.rest = point;
    b.toTop = b.toBottom = point;
    b.index = -1;
    cursorY.current = null;
    rows.current.forEach((r) => r.item?.removeAttribute("data-current"));
    kick();
  };

  const rowAt = (clientY: number) => {
    const list = listRef.current;
    if (!list) return -1;
    const y = clientY - list.getBoundingClientRect().top;
    return metrics.current.findIndex((m) => m && y >= m.top && y < m.top + m.height);
  };
  const halfOf = (clientY: number, k: number): "top" | "bottom" => {
    const list = listRef.current;
    const m = metrics.current[k];
    if (!list || !m) return "top";
    return clientY - list.getBoundingClientRect().top - m.top < m.height / 2 ? "top" : "bottom";
  };

  const measure = () => {
    // the band covers the row itself, not its opened details
    metrics.current = rows.current.map((r) => (r?.item && r.head ? { top: r.item.offsetTop + r.head.offsetTop, height: r.head.offsetHeight } : null));
    const b = band.current;
    if (b.shown && b.index >= 0) {
      const m = metrics.current[b.index];
      if (m) {
        b.toTop = m.top;
        b.toBottom = m.top + m.height;
      }
    }
    paint();
    kick();
  };
  const measureRef = useRef(measure);
  measureRef.current = measure;
  useLayoutEffect(() => {
    rows.current.length = items.length;
    measureRef.current();
    const list = listRef.current;
    if (!list) return;
    const ro = new ResizeObserver(() => measureRef.current());
    ro.observe(list);
    rows.current.forEach((r) => r.item && ro.observe(r.item));
    return () => ro.disconnect();
  }, [items.length]);

  // the open topic changed (or closed): move the band there, or let it go
  const goRef = useRef({ goTo, release });
  goRef.current = { goTo, release };
  useEffect(() => {
    if (activeIndex >= 0) goRef.current.goTo(activeIndex, "center");
    else if (band.current.index >= 0 && cursorY.current === null) goRef.current.release("bottom");
  }, [activeIndex]);
  useEffect(() => {
    const l = loop.current;
    return () => cancelAnimationFrame(l.raf);
  }, []);

  const onPointerMove = (e: ReactPointerEvent<HTMLUListElement>) => {
    if (e.pointerType === "touch") return;
    const list = listRef.current;
    if (list) cursorY.current = e.clientY - list.getBoundingClientRect().top;
    const k = rowAt(e.clientY);
    const m = k >= 0 ? metrics.current[k] : null;
    const y = cursorY.current ?? 0;
    const inside = !!m && y - m.top >= 6 && m.top + m.height - y >= 6;
    if (k >= 0 && k !== band.current.index && (inside || band.current.index < 0)) goTo(k, halfOf(e.clientY, k));
    else kick();
  };
  const onPointerLeave = (e: ReactPointerEvent<HTMLUListElement>) => {
    if (e.pointerType === "touch") return;
    const list = listRef.current;
    const b = band.current;
    cursorY.current = null;
    if (!list || b.index < 0) return;
    const r = list.getBoundingClientRect();
    release(e.clientY <= r.top ? "top" : e.clientY >= r.bottom ? "bottom" : halfOf(e.clientY, b.index));
  };

  return (
    <nav className="fm" aria-label={label}>
      <ul className="fm-list" ref={listRef} onPointerMove={onPointerMove} onPointerLeave={onPointerLeave}>
        {items.map((it, k) => (
          <li
            key={it.id}
            className={`fm-item ${it.feature ? "featured" : ""} ${it.id === active ? "active" : ""}`}
            ref={(el) => {
              rows.current[k] = { ...(rows.current[k] ?? { head: null, band: null }), item: el };
            }}
            style={{ animationDelay: `${k * 60}ms` }}
          >
            <div
              className="fm-head"
              ref={(el) => {
                rows.current[k] = { ...(rows.current[k] ?? { item: null, band: null }), head: el };
              }}
            >
              <button
                className="fm-link"
                aria-expanded={it.content ? it.id === active : undefined}
                onClick={it.onClick}
                onFocus={(e) => e.currentTarget.matches(":focus-visible") && goTo(k, "center")}
              >
                <Row it={it} k={k} open={it.id === active} />
              </button>
              <div
                className="fm-band"
                aria-hidden
                ref={(el) => {
                  rows.current[k] = { ...(rows.current[k] ?? { item: null, head: null }), band: el };
                }}
              >
                <Row it={it} k={k} open={it.id === active} />
              </div>
            </div>
            <AnimatePresence initial={false}>
              {it.id === active && it.content && (
                <motion.div
                  className="fm-body"
                  initial={reduce ? false : { height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={reduce ? undefined : { height: 0, opacity: 0 }}
                  transition={{ duration: 0.36, ease: [0.22, 1, 0.36, 1] }}
                  onUpdate={() => measureRef.current()}
                >
                  <div className="fm-inner">{it.content}</div>
                </motion.div>
              )}
            </AnimatePresence>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function Row({ it, k, open }: { it: FlowItem; k: number; open: boolean }) {
  return (
    <span className="fm-row">
      <span className="fm-index">{String(k + 1).padStart(2, "0")}</span>
      <span className="fm-main">
        <span className="fm-title">
          <Icon name={it.icon} size={14} />
          {it.title}
        </span>
        {it.feature ?? (it.sub && <span className="fm-sub">{it.sub}</span>)}
      </span>
      {it.value && <span className="fm-value">{it.value}</span>}
      <Icon name={it.content ? "chevron" : "arrowRight"} size={15} className={`fm-arrow ${open ? "open" : ""}`} />
    </span>
  );
}
