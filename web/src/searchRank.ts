/**
 * Order of search results in the command palette (CommandPalette.tsx).
 * Written with AI assistance (Claude).
 */
import { fold } from "./fold.ts";

/** Kind order when two results match equally well: continent, country, province, variable, question. */
const KIND = { k: 4, c: 3, a: 2, v: 1, q: 0 } as Record<string, number>;

/**
 * How well a result matches the folded query: the exact name first ("Rusya" → the country,
 * not "Rusya (diğer alanlar)"), then names that start with it, then the rest; within each,
 * bigger places first.
 */
export function hitRank(x: { key: string; label: string; text: string }, f: string): number {
  const exact = fold(x.label) === f ? 2 : 0;
  const start = x.text.startsWith(f) || fold(x.label).startsWith(f) ? 1 : 0;
  return (exact + start) * 10 + (KIND[x.key[0]] ?? 0);
}

