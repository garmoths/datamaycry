/**
 * The side panel as a menu (the team's sketch): one row per topic, a short label on the left
 * and a round indicator on the right that answers at a glance. Opening a row slides its
 * details in over the menu; "≡ Menu" (or Esc-like back) slides back, and the arrows step to
 * the next topic without going back first.
 * ui-lab pieces: the sliding row highlight (Aceternity Card Hover Effect, uilab/HoverBackground).
 * Animated with motion; reduced motion turns the slides and ring draws off.
 * Written with AI assistance (Claude).
 */
import { useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Icon, type IconName } from "./icons.tsx";
import { HoverBackground } from "./uilab/HoverBackground.tsx";
import type { Lang } from "./i18n.ts";
import "./uilab/uilab.css";
import "./sidemenu.css";

export interface MenuItem {
  id: string;
  icon: IconName;
  title: ReactNode;
  /** one short line under the title */
  hint?: ReactNode;
  /** the round indicator on the right */
  indicator?: ReactNode;
  /** a larger answer inside the row (the trend: verdict word and number) */
  feature?: ReactNode;
  /** details, opened over the menu */
  content?: ReactNode;
  /** rows without content act as links (e.g. open the ranking) */
  onClick?: () => void;
}

const EASE = [0.22, 1, 0.36, 1] as const;

export function SideMenu({ items, open, onOpen, lang }: { items: MenuItem[]; open: string | null; onOpen: (id: string | null) => void; lang: Lang }) {
  const reduce = useReducedMotion();
  const [hover, setHover] = useState<string | null>(null);
  // +1: going into a topic (slides left), -1: back to the menu or to an earlier topic
  const [dir, setDir] = useState(1);
  const pages = items.filter((it) => it.content);
  const current = pages.find((it) => it.id === open) ?? null;
  const at = current ? pages.indexOf(current) : -1;
  const go = (id: string | null, d: number) => {
    setDir(d);
    onOpen(id);
  };
  const slide = {
    enter: (d: number) => (reduce ? { opacity: 0 } : { x: 28 * d, opacity: 0 }),
    show: { x: 0, opacity: 1 },
    leave: (d: number) => (reduce ? { opacity: 0 } : { x: -28 * d, opacity: 0 }),
  };
  const tr = lang === "tr";

  return (
    <div className="nav">
      <AnimatePresence mode="popLayout" initial={false} custom={dir}>
        {current ? (
          <motion.section
            key={current.id}
            className="nav-page"
            custom={dir}
            variants={slide}
            initial="enter"
            animate="show"
            exit="leave"
            transition={{ duration: 0.32, ease: EASE }}
          >
            <div className="nav-bar">
              <button className="nav-back" onClick={() => go(null, -1)} aria-label={tr ? "Menüye dön" : "Back to the menu"}>
                <Icon name="menu" size={15} />
                <span>{tr ? "Menü" : "Menu"}</span>
              </button>
              <h2 className="nav-title">
                <Icon name={current.icon} size={15} />
                <span>{current.title}</span>
              </h2>
              <div className="nav-step">
                <button disabled={at <= 0} onClick={() => go(pages[at - 1].id, -1)} aria-label={tr ? "Önceki" : "Previous"}>
                  <Icon name="back" size={14} />
                </button>
                <button disabled={at >= pages.length - 1} onClick={() => go(pages[at + 1].id, 1)} aria-label={tr ? "Sonraki" : "Next"}>
                  <Icon name="arrowRight" size={14} />
                </button>
              </div>
            </div>
            <div className="nav-scroll">{current.content}</div>
          </motion.section>
        ) : (
          <motion.ul
            key="menu"
            className="nav-list"
            custom={dir}
            variants={slide}
            initial="enter"
            animate="show"
            exit="leave"
            transition={{ duration: 0.32, ease: EASE }}
            onMouseLeave={() => setHover(null)}
          >
            {items.map((it, k) => (
              <motion.li
                key={it.id}
                initial={reduce ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, ease: EASE, delay: 0.04 * k }}
              >
                <button
                  className={`nav-row ${it.feature ? "featured" : ""}`}
                  onMouseEnter={() => setHover(it.id)}
                  onFocus={() => setHover(it.id)}
                  onClick={() => (it.content ? go(it.id, 1) : it.onClick?.())}
                >
                  <HoverBackground show={hover === it.id} group="nav" />
                  <span className="nav-icon">
                    <Icon name={it.icon} size={16} />
                  </span>
                  <span className="nav-text">
                    <span className="nav-label">{it.title}</span>
                    {it.feature ?? (it.hint && <span className="nav-hint">{it.hint}</span>)}
                  </span>
                  {it.indicator && <span className="nav-ind">{it.indicator}</span>}
                  <Icon name={it.content ? "arrowRight" : "expand"} size={14} className="nav-go" />
                </button>
              </motion.li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── round indicators ──────────────────────────────────────────────────────────
const R = 15;
const C = 2 * Math.PI * R;

/** An arc from angle a0 to a1 (radians, 0 = top, clockwise) on the indicator circle. */
function arc(a0: number, a1: number): string {
  const p = (a: number) => `${(19 + R * Math.sin(a)).toFixed(2)} ${(19 - R * Math.cos(a)).toFixed(2)}`;
  return `M ${p(a0)} A ${R} ${R} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${p(a1)}`;
}

/** A ring filled to `value` (0–1) with text in the middle (a rank, an arrow). */
export function Ring({ value, color, children, title }: { value: number; color: string; children?: ReactNode; title?: string }) {
  const reduce = useReducedMotion();
  const v = Math.max(0, Math.min(1, value));
  return (
    <span className="ring" title={title}>
      <svg viewBox="0 0 38 38" aria-hidden>
        <circle cx="19" cy="19" r={R} className="ring-track" />
        <motion.circle
          cx="19"
          cy="19"
          r={R}
          className="ring-fill"
          stroke={color}
          strokeDasharray={C}
          initial={reduce ? false : { strokeDashoffset: C }}
          animate={{ strokeDashoffset: C * (1 - v) }}
          transition={{ duration: 0.8, ease: EASE, delay: 0.15 }}
        />
      </svg>
      {children != null && <b className="ring-mid">{children}</b>}
    </span>
  );
}

/** A ring cut into one slice per item (nine variables, twelve months). */
export function RingSlices({ items, children, title }: { items: { color: string; strength: number; title?: string }[]; children?: ReactNode; title?: string }) {
  const reduce = useReducedMotion();
  const n = items.length;
  const gap = n > 1 ? 0.16 : 0;
  return (
    <span className="ring" title={title}>
      <svg viewBox="0 0 38 38" aria-hidden>
        {items.map((x, k) => {
          const a0 = (k / n) * 2 * Math.PI + gap / 2;
          const a1 = ((k + 1) / n) * 2 * Math.PI - gap / 2;
          return (
            <motion.path
              key={k}
              d={arc(a0, a1)}
              className="ring-slice"
              stroke={x.color}
              initial={reduce ? false : { pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 0.25 + 0.75 * x.strength }}
              transition={{ duration: 0.35, ease: EASE, delay: 0.1 + 0.035 * k }}
            >
              {x.title && <title>{x.title}</title>}
            </motion.path>
          );
        })}
      </svg>
      {children != null && <b className="ring-mid">{children}</b>}
    </span>
  );
}
