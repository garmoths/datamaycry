/**
 * View switch as a glass pill with a sliding indicator. Ported from the ui-lab
 * "AnimatedTabs" (pill variant, src/components/ui/animated-tabs.tsx) to plain CSS + motion.
 * Written with AI assistance (Claude).
 */
import { motion, useReducedMotion } from "motion/react";
import { Icon, type IconName } from "./icons.tsx";

export interface TabItem<T extends string> {
  id: T;
  label: string;
  icon: IconName;
  title?: string;
}

export function ViewTabs<T extends string>({ tabs, value, onChange, label }: { tabs: TabItem<T>[]; value: T; onChange: (id: T) => void; label: string }) {
  const reduce = useReducedMotion();
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {tabs.map((t) => {
        const on = t.id === value;
        return (
          <button key={t.id} role="tab" aria-selected={on} className={`tab ${on ? "on" : ""}`} onClick={() => onChange(t.id)} title={t.title}>
            {on && (
              <motion.span
                layoutId="view-tab"
                className="tab-pill"
                transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 34 }}
              />
            )}
            <span className="tab-content">
              <Icon name={t.icon} size={15} />
              {t.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
