/**
 * Status island at the top of the globe: where you are, what you look at, and the answer.
 * Port of Amicro "Dynamic Island" (ui-lab: src/components/amicro/dynamic-island.tsx) to
 * plain CSS + motion: the pill resizes smoothly with its content, the dot breathes while
 * data loads and takes the evidence colour when a result is in. Click it for the summary.
 * Written with AI assistance (Claude).
 */
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { Status } from "./Panel.tsx";
import { t, type Lang } from "./i18n.ts";

export function StatusIsland({ lang, status, variable, onOpen }: { lang: Lang; status: Status; variable: string; onOpen: () => void }) {
  const reduce = useReducedMotion();
  const tone = status.loading ? "loading" : (status.level ?? "plain");
  const key = `${status.place}|${variable}|${status.value}`;
  return (
    <motion.button
      layout={!reduce}
      className={`island ${tone}`}
      onClick={onOpen}
      transition={{ type: "spring", stiffness: 420, damping: 36 }}
      aria-label={t(lang, "tabSummary")}
    >
      <motion.span
        className="island-dot"
        animate={status.loading && !reduce ? { opacity: [0.35, 1, 0.35], scale: [0.85, 1.1, 0.85] } : { opacity: 1, scale: 1 }}
        transition={status.loading ? { duration: 1.1, repeat: Infinity, ease: "easeInOut" } : { duration: 0.2 }}
      />
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={key}
          className="island-text"
          initial={reduce ? false : { opacity: 0, y: 6, filter: "blur(3px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={reduce ? undefined : { opacity: 0, y: -6, filter: "blur(3px)" }}
          transition={{ duration: 0.2 }}
        >
          <b>{status.place}</b>
          <span className="island-sep" aria-hidden />
          <span>{variable}</span>
          {status.value && (
            <>
              <span className="island-sep" aria-hidden />
              <span className="island-value">{status.value}</span>
            </>
          )}
          {status.level && <span className={`island-level ${status.level}`}>{t(lang, status.level)}</span>}
        </motion.span>
      </AnimatePresence>
    </motion.button>
  );
}
