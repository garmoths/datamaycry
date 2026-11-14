/**
 * What the Esc key does: it closes one thing per press, the one on top first.
 * The command palette and the "How it works" dialog handle Esc themselves.
 * Written with AI assistance (Claude).
 */
export interface EscState {
  /** the palette or the dialog is open: they close themselves */
  overlay: boolean;
  /** focus is in a text field: Esc belongs to the field */
  typing: boolean;
  drawer: boolean;
  timeTravel: boolean;
  /** levels in the place trail (1 = world) */
  depth: number;
  customPeriod: boolean;
}

export type EscStep = "drawer" | "timeTravel" | "up" | "period" | null;

export function escapeStep(s: EscState): EscStep {
  if (s.overlay || s.typing) return null;
  if (s.drawer) return "drawer";
  if (s.timeTravel) return "timeTravel";
  if (s.depth > 1) return "up"; // province → country → continent → world
  if (s.customPeriod) return "period";
  return null;
}

/** Esc inside these elements is theirs (clearing a search box, closing a select). */
export function isTyping(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") return !["range", "checkbox", "radio", "button"].includes((el as HTMLInputElement).type);
  return (el as HTMLElement).isContentEditable === true;
}
