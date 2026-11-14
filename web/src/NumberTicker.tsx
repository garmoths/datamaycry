/**
 * Counts up to a number with a spring. Adapted from Magic UI "number-ticker"
 * (https://magicui.design, MIT) for plain CSS — no Tailwind. Respects
 * prefers-reduced-motion. Written with AI assistance (Claude).
 */
import { useEffect, useRef } from "react";
import { useMotionValue, useReducedMotion, useSpring } from "motion/react";

interface Props {
  value: number;
  decimals: number;
  /** "+" in front of positive numbers */
  signed?: boolean;
  /** decimal separator ("," for Turkish) */
  comma?: boolean;
  className?: string;
}

export function NumberTicker({ value, decimals, signed = false, comma = false, className }: Props) {
  const el = useRef<HTMLSpanElement>(null);
  const reduce = useReducedMotion();
  const mv = useMotionValue(0);
  // the default restDelta (0.01) would stop a 0.004 change at ~0; settle on the exact value instead
  const spring = useSpring(mv, { damping: 40, stiffness: 140, restDelta: 1e-7, restSpeed: 1e-6 });

  const fmt = (x: number) => {
    const s = (signed && x > 0 ? "+" : "") + x.toFixed(decimals);
    return comma ? s.replace(".", ",") : s;
  };

  useEffect(() => {
    if (reduce) {
      if (el.current) el.current.textContent = fmt(value);
      return;
    }
    mv.set(value);
  }, [value, reduce]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const offChange = spring.on("change", (x) => {
      // within half a display step of the target → show the target itself, so the
      // last digit always matches the rest of the card
      const shown = Math.abs(x - value) < 0.5 * 10 ** -decimals ? value : x;
      if (el.current) el.current.textContent = fmt(shown);
    });
    // whatever the spring does, the last thing shown is the exact number
    const offDone = spring.on("animationComplete", () => {
      if (el.current) el.current.textContent = fmt(value);
    });
    return () => {
      offChange();
      offDone();
    };
  }, [spring, value, decimals, signed]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <span ref={el} className={className} aria-label={fmt(value)}>
      {fmt(0)}
    </span>
  );
}
