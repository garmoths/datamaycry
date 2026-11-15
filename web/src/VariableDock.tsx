/**
 * Variable dock: the nine MERRA-2 variables in one floating bar along the bottom of the globe.
 * Every variable shows its name next to its icon (on phones only the chosen one) and a soft
 * background slides to the chosen one (motion layoutId); hover adds the unit. Groups are split by thin
 * separators. Started from Magic UI "Dock" (MIT), magnification removed so the bar stays calm.
 * Written with AI assistance (Claude).
 */
import { Fragment, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import type { VarId, VariableInfo } from "./data.ts";
import { VAR_GROUPS, VAR_ICONS } from "./content.ts";
import { Icon } from "./icons.tsx";
import { unitLabel, type Lang } from "./i18n.ts";

interface Props {
  lang: Lang;
  variables: VariableInfo[];
  value: VarId;
  /** variables suggested by the "What are you curious about?" question */
  suggested: VarId[];
  onChange: (id: VarId) => void;
}

export function VariableDock({ lang, variables, value, suggested, onChange }: Props) {
  const reduce = useReducedMotion();
  const byId = new Map(variables.map((v) => [v.id, v]));
  return (
    <nav className="dock" aria-label={lang === "tr" ? "Değişkenler" : "Variables"}>
      {VAR_GROUPS.map((g, gi) => (
        <Fragment key={g.title.en}>
          {gi > 0 && <span className="dock-sep" aria-hidden />}
          {g.ids.map((id) => {
            const v = byId.get(id);
            return v ? (
              <DockItem
                key={id}
                reduce={!!reduce}
                active={id === value}
                suggested={suggested.includes(id) && id !== value}
                name={v.name[lang]}
                label={`${v.name[lang]} · ${unitLabel(v.unit, lang)}${v.experimental ? (lang === "tr" ? " · deneysel" : " · experimental") : ""}`}
                icon={VAR_ICONS[id]}
                onClick={() => onChange(id)}
              />
            ) : null;
          })}
        </Fragment>
      ))}
    </nav>
  );
}

function DockItem(p: {
  reduce: boolean;
  active: boolean;
  suggested: boolean;
  name: string;
  label: string;
  icon: (typeof VAR_ICONS)[VarId];
  onClick: () => void;
}) {
  const [hover, setHover] = useState(false);
  const spring = p.reduce ? { duration: 0 } : { type: "spring" as const, stiffness: 420, damping: 36 };
  return (
    <motion.button
      layout={!p.reduce}
      transition={spring}
      type="button"
      className={`dock-item ${p.active ? "on" : ""} ${p.suggested ? "suggested" : ""}`}
      onClick={p.onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      aria-pressed={p.active}
      aria-label={p.label}
    >
      {p.active && <motion.span layoutId="dock-bg" className="dock-bg" transition={spring} />}
      <Icon name={p.icon} size={18} />
      {/* every name stays on screen; on phones (row layout) CSS keeps only the chosen one */}
      <span className="dock-name">{p.name}</span>
      {hover && !p.active && (
        <motion.span className="dock-label" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.12 }}>
          {p.label}
        </motion.span>
      )}
    </motion.button>
  );
}
