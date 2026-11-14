/**
 * Amicro "text-shimmer" (Subhan-code/Amicro--Micro-transitions-, copied from ui-lab
 * src/components/amicro/text-shimmer.tsx) for loading states: a soft highlight runs across
 * the text. Changes from the original: any text instead of the fixed word "Thinking",
 * plain CSS classes instead of Tailwind, motion/react instead of framer-motion, and the
 * highlight stands still for people who prefer reduced motion.
 */
import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";

export function TextShimmer({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <span className="shimmer-text" role="status">
      {children}
      <motion.span
        className="shimmer-text-light"
        aria-hidden
        style={{ WebkitMaskImage: "linear-gradient(90deg, transparent 0%, black 50%, transparent 100%)", WebkitMaskSize: "200% 100%", maskImage: "linear-gradient(90deg, transparent 0%, black 50%, transparent 100%)", maskSize: "200% 100%" }}
        animate={reduce ? undefined : { maskPosition: ["100% 0%", "-100% 0%"], WebkitMaskPosition: ["100% 0%", "-100% 0%"] } as never}
        transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
      >
        {children}
      </motion.span>
    </span>
  );
}
