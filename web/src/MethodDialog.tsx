/** "How it works" dialog (PLAN.md §3.7-3d: an open method page). Written with AI assistance (Claude). */
import { useEffect, useRef } from "react";
import { motion, useReducedMotion } from "motion/react";
import { METHOD_LIMITS, METHOD_STEPS } from "./content.ts";
import { t, type Lang } from "./i18n.ts";

export function MethodDialog({ lang, open, onClose }: { lang: Lang; open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog ref={ref} className="method" onClose={onClose} onClick={(e) => e.target === ref.current && onClose()}>
      <div className="method-inner">
        <header>
          <h2>{t(lang, "howItWorks")}</h2>
          <button className="seg-btn" onClick={onClose} aria-label={t(lang, "close")}>
            ✕
          </button>
        </header>
        <ol className="steps">
          {METHOD_STEPS.map((s, k) => (
            <motion.li
              key={k}
              initial={reduce || !open ? false : { opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: reduce ? 0 : 0.05 * k, duration: 0.25 }}
            >
              <strong>{s.title[lang]}</strong>
              <p>{s.body[lang]}</p>
            </motion.li>
          ))}
        </ol>
        <h3>{t(lang, "limits")}</h3>
        <p className="fine">{METHOD_LIMITS[lang]}</p>
        <p className="fine">
          Mann (1945) · Kendall (1975) · Sen (1968) · Benjamini & Hochberg (1995) · NASA MERRA-2 · Natural Earth
        </p>
      </div>
    </dialog>
  );
}
