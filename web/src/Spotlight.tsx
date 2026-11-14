/**
 * Spotlight card — port of React Bits "SpotlightCard" (ui-lab: src/components/SpotlightCard.tsx)
 * combined with Magic UI "BentoCard"'s inset glow, in plain CSS. A soft light follows the
 * mouse inside the card and its border brightens near the cursor; nothing moves for people
 * who prefer reduced motion (CSS handles that).
 * Written with AI assistance (Claude).
 */
import { useRef, type HTMLAttributes, type ReactNode } from "react";

export function Spotlight({ children, className = "", ...rest }: { children: ReactNode; className?: string } & HTMLAttributes<HTMLDivElement>) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={ref}
      className={`spot ${className}`}
      onPointerMove={(e) => {
        const el = ref.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        el.style.setProperty("--mx", `${e.clientX - r.left}px`);
        el.style.setProperty("--my", `${e.clientY - r.top}px`);
      }}
      {...rest}
    >
      {children}
    </div>
  );
}
