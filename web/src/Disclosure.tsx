/**
 * A folded section of the side panel: one line with a title and a short hint, the
 * details slide open below it (height animation, instant for reduced motion).
 * Keeps the first view simple; the full calculation is one click away.
 * Written with AI assistance (Claude).
 */
import { useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Icon } from "./icons.tsx";

export function Disclosure({ title, hint, children, defaultOpen = false }: { title: string; hint?: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const reduce = useReducedMotion();
  return (
    <div className={`disclosure ${open ? "open" : ""}`}>
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}>
        {title}
        {hint && <small>{hint}</small>}
        <Icon name="chevron" size={16} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            className="disclosure-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={reduce ? { duration: 0 } : { duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="disclosure-inner">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
