/**
 * Aceternity UI "Card Hover Effect" (ui.aceternity.com, copied from ui-lab
 * src/components/ui/card-hover-effect.tsx): one highlight that slides from item to item
 * under the pointer (a shared motion layoutId) instead of each item lighting up on its own.
 * Changes from the original: only the sliding highlight is kept, as a span placed inside any
 * item; plain CSS (.hover-bg in uilab.css) instead of Tailwind; no motion for people who
 * prefer reduced motion.
 */
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import "./uilab.css";

export function HoverBackground({ show, group }: { show: boolean; group: string }) {
  const reduce = useReducedMotion();
  return (
    <AnimatePresence>
      {show && (
        <motion.span
          className="hover-bg"
          layoutId={reduce ? undefined : `hover-bg-${group}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: 0.15 } }}
          exit={{ opacity: 0, transition: { duration: 0.15, delay: 0.12 } }}
          transition={{ type: "spring", stiffness: 520, damping: 42 }}
          aria-hidden
        />
      )}
    </AnimatePresence>
  );
}
