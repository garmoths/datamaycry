/**
 * Tile-view scale ladder: World → Block → Data tile → Sub-tile → Grid cell. All scales are
 * drawn on the globe at once; after a click the ladder shows which ones contain the cell.
 * The highlight slides between steps (motion layoutId, idea from Animate UI /
 * Magic UI tab indicators, rebuilt in plain CSS). Written with AI assistance (Claude).
 */
import { motion, useReducedMotion } from "motion/react";
import { CELL_LEVEL, dataTileOf, nodeCenter, SCALES, type Node } from "./geo.ts";
import type { Lang } from "./i18n.ts";

interface Props {
  lang: Lang;
  /** path[0] = world, path[k] = node chosen at level k */
  path: Node[];
  onGo: (level: number) => void;
}

const fmt = (lat: number, lon: number) =>
  `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? "N" : "S"} ${Math.abs(lon).toFixed(2)}°${lon >= 0 ? "E" : "W"}`;

function detail(n: Node, lang: Lang): string {
  const c = nodeCenter(n);
  switch (n.level) {
    case 0:
      return lang === "tr" ? "72 blok" : "72 blocks";
    case 2: {
      const { ty, tx } = dataTileOf(n);
      return `tiles/{VAR}/${ty}_${tx}.bin`;
    }
    case CELL_LEVEL:
      return `i ${n.i0} · j ${n.j0} · ${fmt(c.lat, c.lon)}`;
    default:
      return fmt(c.lat, c.lon);
  }
}

const NEXT: Record<Lang, string[]> = {
  en: [
    "Every grid cell is drawn on the globe. Click anywhere to pick one — zoom in to see the finest squares.",
    "", "", "",
    "Time series ready. Click a step above to frame that scale, or another square on the globe.",
  ],
  tr: [
    "Her ızgara hücresi globun üzerinde çizili. Birini seçmek için herhangi bir yere tıkla — en küçük kareleri görmek için yakınlaş.",
    "", "", "",
    "Zaman serisi hazır. O ölçeği çerçevelemek için yukarıdaki bir adıma, ya da globda başka bir kareye tıkla.",
  ],
};

export function ScaleLadder({ lang, path, onGo }: Props) {
  const reduce = useReducedMotion();
  const depth = path.length - 1;
  return (
    <div className="ladder">
      <ol>
        {SCALES.map((s, level) => {
          const node = path[level];
          const active = level === depth;
          return (
            <li key={level} className={`${node ? "reached" : "todo"} ${active ? "active" : ""}`}>
              <button disabled={!node} onClick={() => onGo(level)} aria-current={active ? "step" : undefined}>
                {active && (
                  <motion.span
                    layoutId="ladder-active"
                    className="ladder-glow"
                    transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 34 }}
                  />
                )}
                <span className="ladder-dot">{level}</span>
                <span className="ladder-text">
                  <strong>{s[lang]}</strong>
                  <small>{s.size}</small>
                  {node && <em>{detail(node, lang)}</em>}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <p className="hint">{NEXT[lang][depth]}</p>
    </div>
  );
}
