/**
 * Command palette (Ctrl/⌘ K or "/"): one box to jump to any country, province, continent,
 * variable or question. Accent-insensitive ("diyarbakir" finds "Diyarbakır").
 * Keyboard: ↑ ↓ move · Enter pick · Esc close.
 * Written with AI assistance (Claude).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { CountryInfo, VarId, VariableInfo } from "./data.ts";
import { CONTINENTS } from "./geo.ts";
import { QUESTIONS, VAR_ICONS, type Question } from "./content.ts";
import { fold } from "./fold.ts";
import { hitRank } from "./searchRank.ts";
import { Icon, type IconName } from "./icons.tsx";
import type { Lang } from "./i18n.ts";

export interface CountryLite {
  id: string;
  name_en: string;
  name_tr: string;
}

interface Item {
  key: string;
  icon: IconName;
  label: string;
  sub: string;
  hasData?: boolean;
  text: string;
  run: () => void;
}

interface Props {
  lang: Lang;
  open: boolean;
  onOpen: (open: boolean) => void;
  countries: CountryLite[];
  index: CountryInfo[];
  /** every province of the country that is open now (from its border file) */
  provinces: { id: string; name: Record<Lang, string> }[];
  countryId: string | null;
  variables: VariableInfo[];
  onCountry: (id: string) => void;
  onAdmin1: (country: string, id: string) => void;
  onContinent: (id: string) => void;
  onVariable: (id: VarId) => void;
  onQuestion: (q: Question) => void;
}

export function CommandPalette(p: Props) {
  const reduce = useReducedMotion();
  const { onOpen } = p;

  // global shortcut: Ctrl/⌘ K or "/" (when not typing somewhere else)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = /input|textarea|select/i.test((e.target as HTMLElement)?.tagName ?? "");
      if ((e.key === "k" && (e.ctrlKey || e.metaKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        onOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onOpen]);

  return (
    <AnimatePresence>
      {p.open && (
        <motion.div className="palette-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => onOpen(false)}>
          <motion.div
            className="palette"
            role="dialog"
            aria-label={p.lang === "tr" ? "Ara" : "Search"}
            initial={reduce ? false : { opacity: 0, y: -10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? undefined : { opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.16 }}
            onClick={(e) => e.stopPropagation()}
          >
            <PaletteBody {...p} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** The palette's contents; mounted fresh on every open, so the search starts empty. */
function PaletteBody(p: Props) {
  const tr = p.lang === "tr";
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const { onOpen } = p;
  useEffect(() => {
    const id = setTimeout(() => input.current?.focus(), 30);
    return () => clearTimeout(id);
  }, []);

  const all: Item[] = useMemo(() => {
    const L = p.lang;
    const close = (fn: () => void) => () => {
      fn();
      onOpen(false);
    };
    const withData = new Set(p.index.map((c) => c.id));
    const items: Item[] = [];
    for (const v of p.variables)
      items.push({ key: `v:${v.id}`, icon: VAR_ICONS[v.id], label: v.name[L], sub: tr ? "Değişken" : "Variable", text: fold(`${v.name.en} ${v.name.tr} ${v.id}`), run: close(() => p.onVariable(v.id)) });
    for (const c of CONTINENTS)
      items.push({ key: `k:${c.id}`, icon: "globe", label: c[L], sub: tr ? "Kıta" : "Continent", hasData: true, text: fold(`${c.en} ${c.tr}`), run: close(() => p.onContinent(c.id)) });
    const seen = new Set<string>();
    const here = p.countries.find((c) => c.id === p.countryId);
    if (here)
      for (const a of p.provinces) {
        seen.add(a.id);
        items.push({ key: `a:${a.id}`, icon: "pin", label: a.name[L], sub: here[`name_${L}`], hasData: true, text: fold(`${a.name.en} ${a.name.tr}`), run: close(() => p.onAdmin1(here.id, a.id)) });
      }
    for (const c of p.index)
      for (const a of c.admin1.filter((x) => !seen.has(x.id)))
        items.push({ key: `a:${a.id}`, icon: "pin", label: a.name[L], sub: c.name[L], hasData: true, text: fold(`${a.name.en} ${a.name.tr}`), run: close(() => p.onAdmin1(c.id, a.id)) });
    for (const c of p.countries)
      items.push({ key: `c:${c.id}`, icon: "flag", label: c[`name_${L}`], sub: tr ? "Ülke" : "Country", hasData: withData.has(c.id), text: fold(`${c.name_en} ${c.name_tr}`), run: close(() => p.onCountry(c.id)) });
    for (const qq of QUESTIONS)
      items.push({ key: `q:${qq.id}`, icon: qq.icon, label: qq.q[L], sub: tr ? "Soru" : "Question", text: fold(`${qq.q.en} ${qq.q.tr}`), run: close(() => p.onQuestion(qq)) });
    return items;
  }, [p, tr, onOpen]);

  const hits = useMemo(() => {
    const f = fold(q.trim());
    if (!f) return all.filter((x) => x.key.startsWith("q:") || x.key.startsWith("k:")).slice(0, 9);
    return all
      .filter((x) => x.text.includes(f))
      .sort((a, b) => hitRank(b, f) - hitRank(a, f) || Number(!!b.hasData) - Number(!!a.hasData))
      .slice(0, 9);
  }, [q, all]);

  return (
    <>
            <div className="palette-input">
        <Icon name="search" size={18} />
        <input
          ref={input}
          value={q}
          placeholder={tr ? "Ülke, şehir, kıta, değişken ya da soru…" : "Country, city, continent, variable or question…"}
          onChange={(e) => {
            setQ(e.target.value);
            setSel(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") setSel((s) => Math.min(s + 1, hits.length - 1));
            else if (e.key === "ArrowUp") setSel((s) => Math.max(s - 1, 0));
            else if (e.key === "Enter") hits[sel]?.run();
            else if (e.key === "Escape") {
                // clear first: reopening during the exit animation reuses this instance
                setQ("");
                setSel(0);
                onOpen(false);
              }
            else return;
            e.preventDefault();
          }}
        />
        <kbd>Esc</kbd>
      </div>
      <ul className="palette-list" role="listbox">
        {hits.map((h, k) => (
          <li key={h.key} role="option" aria-selected={k === sel}>
            <button className={k === sel ? "on" : ""} onMouseEnter={() => setSel(k)} onClick={h.run}>
              <Icon name={h.icon} size={16} />
              <span className="palette-label">{h.label}</span>
              <small>
                {h.sub}
                {h.hasData && h.key.startsWith("c:") && <i className="data-dot" />}
              </small>
            </button>
          </li>
        ))}
        {hits.length === 0 && <li className="palette-empty">{tr ? "Sonuç yok" : "No results"}</li>}
      </ul>
      <p className="palette-foot">
        <kbd>↑</kbd> <kbd>↓</kbd> {tr ? "gez" : "move"} · <kbd>Enter</kbd> {tr ? "seç" : "pick"} · <kbd>Ctrl</kbd> <kbd>K</kbd> {tr ? "aç" : "open"}
      </p>
    </>
  );
}
