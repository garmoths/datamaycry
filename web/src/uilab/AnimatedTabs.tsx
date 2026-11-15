/**
 * "Animated Tabs" from the ui-lab stack (ui-lab src/components/ui/animated-tabs.tsx): a
 * segmented control whose active pill slides to the picked tab (a shared motion layoutId).
 * Changes from the original: tab bar only (the caller renders the content), motion/react
 * instead of framer-motion, plain CSS (.atabs in uilab.css) instead of Tailwind, and the
 * pill jumps without sliding for people who prefer reduced motion.
 */
import { useId, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import "./uilab.css";

export interface TabItem<T extends string> {
  id: T;
  label: ReactNode;
}

export function AnimatedTabs<T extends string>({ tabs, value, onChange, label, size = "md" }: {
  tabs: TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  label?: string;
  size?: "sm" | "md";
}) {
  const id = useId();
  const reduce = useReducedMotion();
  return (
    <div className={`atabs ${size}`} role="tablist" aria-label={label}>
      {tabs.map((tab) => {
        const on = tab.id === value;
        return (
          <button key={tab.id} role="tab" aria-selected={on} className={on ? "on" : ""} onClick={() => onChange(tab.id)}>
            {on && (
              <motion.span
                className="atabs-pill"
                layoutId={`atabs-${id}`}
                transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 480, damping: 38 }}
                aria-hidden
              />
            )}
            <span className="atabs-label">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}
