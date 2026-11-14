/**
 * Shareable links: the current view, variable and place live in the URL hash, e.g.
 *   #v=T2M&m=region&c=TUR&a=TR-21     (Diyarbakır temperature)
 *   #v=PRECTOT&m=point&cell=256,352   (one grid cell)
 * Written with AI assistance (Claude).
 */
import type { VarId } from "./data.ts";

export interface LinkState {
  v?: VarId;
  m?: "region" | "point";
  c?: string;
  a?: string;
  cell?: [number, number];
}

export function readLink(hash = location.hash): LinkState {
  const q = new URLSearchParams(hash.replace(/^#/, ""));
  const out: LinkState = {};
  const v = q.get("v");
  if (v && /^[A-Z0-9]+$/.test(v)) out.v = v as VarId;
  const m = q.get("m");
  if (m === "region" || m === "point") out.m = m;
  const c = q.get("c");
  if (c && /^[A-Z]{3}$/.test(c)) out.c = c;
  const a = q.get("a");
  // province ids: "TR-21", "RU-AD", "ASM-5001" and Natural Earth leftovers like "BVT+00?"
  if (a && /^[A-Za-z0-9+?_.~-]{2,16}$/.test(a)) out.a = a;
  const cell = q.get("cell")?.split(",").map(Number);
  if (cell?.length === 2 && cell.every((x) => Number.isInteger(x) && x >= 0) && cell[0] <= 360 && cell[1] < 576) out.cell = [cell[0], cell[1]];
  return out;
}

export function writeLink(s: LinkState): string {
  const q = new URLSearchParams();
  if (s.v) q.set("v", s.v);
  if (s.m) q.set("m", s.m);
  if (s.c) q.set("c", s.c);
  if (s.a) q.set("a", s.a);
  if (s.cell) q.set("cell", s.cell.join(","));
  return `#${q.toString().replace(/%2C/g, ",")}`;
}
