/**
 * Place search: type a country or province name (English or Turkish, accents ignored) and
 * jump there. Keyboard: ↑ ↓ to move, Enter to pick, Esc to close.
 * Written with AI assistance (Claude).
 */
import { useMemo, useState } from "react";
import type { CountryInfo } from "./data.ts";
import type { CountryRow } from "./Panel.tsx";
import { Icon } from "./icons.tsx";
import type { Lang } from "./i18n.ts";
import { fold } from "./fold.ts";

interface Hit {
  key: string;
  label: string;
  sub: string;
  hasData: boolean;
  go: () => void;
}

export function PlaceSearch(p: {
  lang: Lang;
  countryRows: CountryRow[];
  index: CountryInfo[];
  onCountry: (id: string) => void;
  onAdmin1: (country: string, id: string) => void;
}) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const tr = p.lang === "tr";

  const all = useMemo(() => {
    const withData = new Set(p.index.map((c) => c.id));
    const out: (Omit<Hit, "go"> & { text: string; country: string; admin1: string | null })[] = [];
    for (const c of p.index)
      for (const a of c.admin1)
        out.push({
          key: a.id,
          label: a.name[p.lang],
          sub: c.name[p.lang],
          hasData: true,
          text: fold(`${a.name.en} ${a.name.tr}`),
          country: c.id,
          admin1: a.id,
        });
    for (const c of p.countryRows)
      out.push({
        key: c.id,
        label: c[`name_${p.lang}`],
        sub: tr ? "Ülke" : "Country",
        hasData: withData.has(c.id),
        text: fold(`${c.name_en} ${c.name_tr}`),
        country: c.id,
        admin1: null,
      });
    return out;
  }, [p.index, p.countryRows, p.lang, tr]);

  const hits: Hit[] = useMemo(() => {
    const f = fold(q.trim());
    if (f.length < 2) return [];
    return all
      .filter((h) => h.text.includes(f))
      .sort((a, b) => Number(b.text.startsWith(f)) - Number(a.text.startsWith(f)) || Number(b.hasData) - Number(a.hasData))
      .slice(0, 7)
      .map((h) => ({ ...h, go: () => (h.admin1 ? p.onAdmin1(h.country, h.admin1) : p.onCountry(h.country)) }));
  }, [q, all, p]);

  const pick = (h: Hit | undefined) => {
    if (!h) return;
    h.go();
    setQ("");
    setSel(0);
  };

  return (
    <div className="search" role="combobox" aria-expanded={hits.length > 0} aria-haspopup="listbox">
      <Icon name="search" size={17} className="search-icon" />
      <input
        value={q}
        placeholder={tr ? "Ülke ya da şehir ara…" : "Search a country or city…"}
        aria-label={tr ? "Yer ara" : "Search places"}
        onChange={(e) => {
          setQ(e.target.value);
          setSel(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") setSel((s) => Math.min(s + 1, hits.length - 1));
          else if (e.key === "ArrowUp") setSel((s) => Math.max(s - 1, 0));
          else if (e.key === "Enter") pick(hits[sel]);
          else if (e.key === "Escape") setQ("");
          else return;
          e.preventDefault();
        }}
      />
      {hits.length > 0 && (
        <ul className="search-list" role="listbox">
          {hits.map((h, k) => (
            <li key={h.key} role="option" aria-selected={k === sel}>
              <button className={k === sel ? "on" : ""} onMouseEnter={() => setSel(k)} onClick={() => pick(h)}>
                <span>{h.label}</span>
                <small>
                  {h.sub}
                  {h.hasData && <i className="data-dot" title={tr ? "Aylık seri var" : "Monthly series available"} />}
                </small>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
