/**
 * Variable dock — the nine MERRA-2 variables as a vertical macOS-style dock (rail) on the left.
 * Ported from Magic UI "Dock" (ui-lab: src/components/ui/dock.tsx, MIT) to plain CSS:
 * icons grow as the mouse approaches (motion springs), a label appears beside the hovered
 * icon, a dot marks the active variable, and groups are split by thin separators.
 * Magnification is off for people who prefer reduced motion.
 * Written with AI assistance (Claude).
 */
import { Fragment, useRef, useState } from "react";
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform, type MotionValue } from "motion/react";
import type { VarId, VariableInfo } from "./data.ts";
import { VAR_GROUPS, VAR_ICONS } from "./content.ts";
import { Icon } from "./icons.tsx";
import { unitLabel, type Lang } from "./i18n.ts";

const SIZE = 36;
const MAGNIFIED = 50;
const DISTANCE = 110;

interface Props {
  lang: Lang;
  variables: VariableInfo[];
  value: VarId;
  /** variables suggested by the "What are you curious about?" question */
  suggested: VarId[];
  onChange: (id: VarId) => void;
}

export function VariableDock({ lang, variables, value, suggested, onChange }: Props) {
  const mouseY = useMotionValue(Infinity);
  const reduce = useReducedMotion();
  const byId = new Map(variables.map((v) => [v.id, v]));
  return (
    <motion.nav
      className="dock"
      aria-label={lang === "tr" ? "Değişkenler" : "Variables"}
      onMouseMove={(e) => mouseY.set(e.pageY)}
      onMouseLeave={() => mouseY.set(Infinity)}
    >
      {VAR_GROUPS.map((g, gi) => (
        <Fragment key={g.title.en}>
          {gi > 0 && <span className="dock-sep" aria-hidden />}
          {g.ids.map((id) => {
            const v = byId.get(id);
            return v ? (
              <DockItem
                key={id}
                mouse={mouseY}
                magnify={!reduce}
                active={id === value}
                suggested={suggested.includes(id) && id !== value}
                label={`${v.name[lang]} · ${unitLabel(v.unit, lang)}`}
                icon={VAR_ICONS[id]}
                onClick={() => onChange(id)}
              />
            ) : null;
          })}
        </Fragment>
      ))}
    </motion.nav>
  );
}

function DockItem(p: {
  mouse: MotionValue<number>;
  magnify: boolean;
  active: boolean;
  suggested: boolean;
  label: string;
  icon: (typeof VAR_ICONS)[VarId];
  onClick: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [hover, setHover] = useState(false);
  const distance = useTransform(p.mouse, (y) => {
    const b = ref.current?.getBoundingClientRect() ?? { y: 0, height: 0 };
    return y - b.y - b.height / 2;
  });
  const target = useTransform(distance, [-DISTANCE, 0, DISTANCE], [SIZE, p.magnify ? MAGNIFIED : SIZE, SIZE]);
  const size = useSpring(target, { mass: 0.1, stiffness: 150, damping: 12 });
  return (
    <motion.button
      ref={ref}
      type="button"
      className={`dock-item ${p.active ? "on" : ""} ${p.suggested ? "suggested" : ""}`}
      style={{ width: size, height: size }}
      onClick={p.onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      aria-pressed={p.active}
      aria-label={p.label}
    >
      <Icon name={p.icon} size={18} />
      {hover && (
        <motion.span className="dock-label" initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.12 }}>
          {p.label}
        </motion.span>
      )}
      {p.active && <motion.span layoutId="dock-dot" className="dock-dot" />}
    </motion.button>
  );
}
