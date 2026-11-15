/**
 * How every change is shown across the app: per decade (the trend's pace) or as the total
 * over the period. One shared, remembered choice (localStorage "dmc-change"): switching it on
 * the card, the fingerprint or the ranking switches it everywhere.
 * Written with AI assistance (Claude).
 */
import { useSyncExternalStore } from "react";
import { t, type Lang } from "./i18n.ts";

export type ChangeView = "decade" | "total";
const KEY = "dmc-change";
const listeners = new Set<() => void>();

function read(): ChangeView {
  try {
    return localStorage.getItem(KEY) === "total" ? "total" : "decade";
  } catch {
    return "decade";
  }
}
let current: ChangeView = typeof window === "undefined" ? "decade" : read();

export function setChangeView(v: ChangeView): void {
  current = v;
  try {
    localStorage.setItem(KEY, v);
  } catch {
    /* private mode: kept for this visit only */
  }
  listeners.forEach((l) => l());
}

export function useChangeView(): [ChangeView, (v: ChangeView) => void] {
  const v = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
    () => "decade" as ChangeView,
  );
  return [v, setChangeView];
}

/** The value to show: the slope per decade, or the change it adds up to over [start, end]. */
export function asView(slopePerDecade: number, view: ChangeView, years: [number, number]): number {
  return view === "total" ? (slopePerDecade * (years[1] - years[0])) / 10 : slopePerDecade;
}

/** Decimals: totals are bigger numbers, so one fewer than the per-decade value. */
export function viewDecimals(view: ChangeView, decimals: number): number {
  return view === "total" ? decimals : decimals + 1;
}

/** Unit text: "°C / 10 yıl" or "°C · 1980–2025". */
export function viewUnit(lang: Lang, unit: string, view: ChangeView, years: [number, number]): string {
  return view === "total" ? `${unit} · ${years[0]}–${years[1]}` : `${unit} / ${t(lang, "decade")}`;
}
