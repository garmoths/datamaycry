import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { readLink, writeLink } from "./share.ts";
import { preloadPlotly } from "./plotlyLoader.ts";
import { VariableDock } from "./VariableDock.tsx";
import { ViewTabs } from "./ViewTabs.tsx";
import type { Question } from "./content.ts";
import { Icon, Logo } from "./icons.tsx";
import { MethodDialog } from "./MethodDialog.tsx";
import {
  getRegionSeries,
  getTrendMap,
  listCountries,
  loadVariables,
  type CountryInfo,
  type TrendMap,
  type VarId,
  type VariablesFile,
} from "./data.ts";
import { Globe, type Marker, type View } from "./Globe.tsx";
import { Panel, type AreaInfo, type CountryRow, type PanelTab, type Status, type Target } from "./Panel.tsx";
import { StatusIsland } from "./StatusIsland.tsx";
import { trendTileUrl, PALETTE_CSS } from "./trendImage.ts";
import {
  bboxOf,
  CELL_LEVEL,
  pathToCell,
  CONTINENTS,
  loadBoundaries,
  nodeBounds,
  nodeCenter,
  WORLD,
  WORLD_NODE,
  type Boundaries,
  type Bounds,
  type Node,
} from "./geo.ts";
import { t, type Lang } from "./i18n.ts";
import { countryCode, rasterizeContinents, rasterizeCountries, summarize } from "./continentStats.ts";
import "./App.css";


/** Run `fn` when the browser has nothing better to do (falls back to a timeout). */
function whenIdle(fn: () => void): void {
  const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: object) => number }).requestIdleCallback;
  if (ric) ric(fn, { timeout: 4000 });
  else window.setTimeout(fn, 1500);
}
const savedLang = (): Lang => {
  try {
    return localStorage.getItem("dmc-lang") === "tr" ? "tr" : "en";
  } catch {
    return "en";
  }
};

export default function App() {
  const [lang, setLang] = useState<Lang>(savedLang);
  const [mode, setMode] = useState<"region" | "point">("region");
  const [variables, setVariables] = useState<VariablesFile | null>(null);
  const [index, setIndex] = useState<CountryInfo[]>([]);
  const [bounds, setBounds] = useState<Boundaries | null>(null);
  const [varId, setVarId] = useState<VarId>("T2M");
  const [showTrend, setShowTrend] = useState(true);
  const [trendTiles, setTrendTiles] = useState<string | null>(null);
  const [trendMap, setTrendMap] = useState<TrendMap | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [noGl, setNoGl] = useState(false);
  const [methodOpen, setMethodOpen] = useState(false);
  const [question, setQuestion] = useState<Question | null>(null);
  const [tab, setTab] = useState<PanelTab>("explore");
  const [status, setStatus] = useState<Status>({ place: "", value: null, level: null, loading: false });

  const [continent, setContinent] = useState<string | null>(null);
  const [countryId, setCountryId] = useState<string | null>(null);
  const [admin1Id, setAdmin1Id] = useState<string | null>(null);
  // Point mode: path[0] = world, path[k] = node chosen at scale k (see geo.ts SCALES)
  const [path, setPath] = useState<Node[]>([WORLD_NODE]);
  const [view, setView] = useState<View>({ bounds: WORLD, key: "world" });

  useEffect(() => {
    Promise.all([loadVariables(), listCountries(), loadBoundaries()])
      .then(([v, c, b]) => {
        setVariables(v);
        setIndex(c.countries);
        setBounds(b);
      })
      .catch((e: Error) => setFatal(e.message));
    // warm the caches the first click will need: the chart library and the demo countries
    whenIdle(() => {
      void preloadPlotly();
      for (const c of ["TUR", "EGY", "BRA"]) void getRegionSeries(c, null, "T2M").catch(() => {});
    });
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("dmc-lang", lang);
    } catch {
      /* private mode */
    }
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => {
    let dead = false;
    getTrendMap(varId)
      .then((m) => {
        if (dead) return;
        setTrendMap(m);
        // tiles are painted on demand by the map (trendImage.ts); this only registers the field
        setTrendTiles(trendTileUrl(varId, m));
      })
      .catch(() => {
        if (dead) return;
        setTrendMap(null);
        setTrendTiles(null);
      });
    return () => {
      dead = true;
    };
  }, [varId]);

  const countryRows: CountryRow[] = useMemo(
    () => bounds?.countries.features.map((f) => f.properties).filter((c) => c.id && c.id !== "-99") ?? [],
    [bounds],
  );
  // which continent / country each grid cell is in (computed once from the borders)
  const continentGrid = useMemo(() => (bounds ? rasterizeContinents(bounds) : null), [bounds]);
  const countryGrid = useMemo(() => (bounds ? rasterizeCountries(bounds) : null), [bounds]);
  // Summary card for the place at the current level: world → continent → country
  const area: AreaInfo | null = useMemo(() => {
    if (!trendMap || !bounds || mode !== "region" || admin1Id) return null;
    if (countryId) {
      const code = countryCode(bounds, countryId);
      const s = countryGrid && code ? summarize(trendMap, countryGrid, code) : null;
      return s && { kind: "country", summary: s };
    }
    if (continent) {
      const idx = CONTINENTS.findIndex((c) => c.id === continent);
      const s = continentGrid && idx >= 0 ? summarize(trendMap, continentGrid, idx + 1) : null;
      return s && { kind: "continent", summary: s };
    }
    const s = summarize(trendMap, null);
    return s && { kind: "world", summary: s };
  }, [trendMap, bounds, mode, continent, countryId, admin1Id, continentGrid, countryGrid]);

  const flyTo = useCallback((b: Bounds, key: string) => setView({ bounds: b, key }), []);

  const reset = useCallback(() => {
      setTab("explore");
    setContinent(null);
    setCountryId(null);
    setAdmin1Id(null);
    setPath([WORLD_NODE]);
    flyTo(WORLD, `world:${Date.now()}`);
  }, [flyTo]);

  const pickContinent = useCallback(
    (id: string) => {
      setTab("summary");
      setContinent(id);
      setCountryId(null);
      setAdmin1Id(null);
      flyTo(CONTINENTS.find((c) => c.id === id)!.bbox, `cont:${id}`);
    },
    [flyTo],
  );

  const pickCountry = useCallback(
    (id: string) => {
      setTab("summary");
      if (!bounds) return;
      const row = bounds.countries.features.find((f) => f.properties.id === id);
      if (row) setContinent(row.properties.continent);
      setCountryId(id);
      setAdmin1Id(null);
      const box = index.find((c) => c.id === id)?.bbox ?? (row ? bboxOf([row]) : WORLD);
      flyTo(box, `country:${id}`);
    },
    [bounds, index, flyTo],
  );

  const pickAdmin1 = useCallback(
    (country: string, id: string) => {
      setTab("summary");
      if (!bounds) return;
      // a province can be reached straight from search or a link: keep the trail complete
      const row = bounds.countries.features.find((x) => x.properties.id === country);
      if (row) setContinent(row.properties.continent);
      setCountryId(country);
      setAdmin1Id(id);
      const f = bounds.admin1.features.find((x) => x.properties.id === id);
      if (f) flyTo(bboxOf([f]), `admin1:${id}`);
    },
    [bounds, flyTo],
  );

  const switchMode = (m: "region" | "point") => {
    if (m === mode) return;
    setMode(m);
    reset();
  };

  const last = path[path.length - 1];
  const cell = last.level === CELL_LEVEL ? last : null;
  const point = cell ? nodeCenter(cell) : null;

  // Tile view: one click on the globe picks the grid cell directly; the ladder shows its
  // block / data tile / sub-tile. The camera only moves when the click lands in a new 10° tile.
  const pickCell = useCallback(
    (i: number, j: number) => {
      setTab("summary");
      const next = pathToCell(i, j);
      const tile = next[2];
      const sameTile = path[2] && path[2].i0 === tile.i0 && path[2].j0 === tile.j0;
      setPath(next);
      if (!sameTile) flyTo(nodeBounds(tile), `tile:${tile.i0}:${tile.j0}`);
    },
    [path, flyTo],
  );

  // Ladder click: just frame that scale around the chosen cell
  const goToScale = useCallback(
    (level: number) => {
      flyTo(level === 0 ? WORLD : nodeBounds(path[level]), `scale:${level}:${Date.now()}`);
    },
    [path, flyTo],
  );

  // Region view: an orange dot on every country and province that has data
  const markers: Marker[] = useMemo(() => {
    if (!bounds) return [];
    const out: Marker[] = [];
    for (const c of index) {
      for (const a of c.admin1) {
        const f = bounds.admin1.features.find((x) => x.properties.id === a.id);
        if (!f) continue;
        const [w, s, e, n] = bboxOf([f]);
        out.push({ id: a.id, country: c.id, admin1: a.id, label: `${a.name[lang]}, ${c.name[lang]}`, lat: (s + n) / 2, lon: (w + e) / 2 });
      }
    }
    return out;
  }, [bounds, index, lang]);

  // ── shareable link: restore once when the data is ready, then keep the URL in sync ──
  const linkApplied = useRef(false);
  useEffect(() => {
    if (linkApplied.current || !bounds || !variables || !index.length) return;
    linkApplied.current = true;
    const l = readLink();
    if (l.v && variables.variables.some((x) => x.id === l.v)) setVarId(l.v);
    if (l.m === "point" && l.cell) {
      setMode("point");
      pickCell(l.cell[0], l.cell[1]);
    } else if (l.c) {
      if (l.a) {
        pickCountry(l.c);
        pickAdmin1(l.c, l.a);
      } else pickCountry(l.c);
    }
  }, [bounds, variables, index, pickCell, pickCountry, pickAdmin1]);
  useEffect(() => {
    if (!linkApplied.current) return;
    const hash = writeLink({
      v: varId,
      m: mode,
      c: mode === "region" ? (countryId ?? undefined) : undefined,
      a: mode === "region" ? (admin1Id ?? undefined) : undefined,
      cell: mode === "point" && cell ? [cell.i0, cell.j0] : undefined,
    });
    if (hash !== location.hash) history.replaceState(null, "", hash);
  }, [varId, mode, countryId, admin1Id, cell]);
  const [copied, setCopied] = useState(false);
  const copyLink = () => {
    navigator.clipboard?.writeText(location.href).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1800);
      },
      () => {},
    );
  };

  const target: Target = useMemo(() => {
    if (mode === "point") return point ? { type: "point", lat: point.lat, lon: point.lon } : null;
    // contract 1.2: a continent on its own has a real monthly series too
    if (!countryId) {
      const c = CONTINENTS.find((x) => x.id === continent);
      return c && variables?.variables && index.length ? { type: "continent", id: c.code } : null;
    }
    if (!index.some((c) => c.id === countryId)) return null;
    return { type: "region", country: countryId, admin1: admin1Id };
  }, [mode, point, continent, countryId, admin1Id, index, variables]);

  const trail = useMemo(() => {
    const out: { label: string; go: () => void }[] = [{ label: t(lang, "world"), go: reset }];
    if (mode === "region") {
      const c = CONTINENTS.find((x) => x.id === continent);
      if (c) out.push({ label: c[lang], go: () => pickContinent(c.id) });
      const co = index.find((x) => x.id === countryId);
      const row = countryRows.find((x) => x.id === countryId);
      if (countryId) out.push({ label: co?.name[lang] ?? row?.[`name_${lang}`] ?? countryId, go: () => pickCountry(countryId) });
      const a = co?.admin1.find((x) => x.id === admin1Id);
      if (a && countryId) out.push({ label: a.name[lang], go: () => pickAdmin1(countryId, a.id) });
    } else if (point) {
      out.push({ label: `${point.lat.toFixed(2)}°, ${point.lon.toFixed(2)}°`, go: () => {} });
    }
    return out;
  }, [lang, mode, continent, countryId, admin1Id, point, index, countryRows, reset, pickContinent, pickCountry, pickAdmin1]);

  const demos = useMemo(() => {
    const regionDemo = (label: string, country: string, admin1: string, v: VarId) => ({
      label,
      go: () => {
        setMode("region");
        setPath([WORLD_NODE]);
        setVarId(v);
        pickCountry(country);
        pickAdmin1(country, admin1); // state updates batch; the later camera move wins
      },
    });
    return lang === "tr"
      ? [
          regionDemo("Diyarbakır sıcaklık", "TUR", "TR-21", "T2M"),
          regionDemo("Konya toprak nemi", "TUR", "TR-42", "GWETROOT"),
          regionDemo("Asvan sıcaklık", "EGY", "EG-ASN", "T2M"),
          regionDemo("Amazonas yağış", "BRA", "BR-AM", "PRECTOT"),
        ]
      : [
          regionDemo("Diyarbakır temperature", "TUR", "TR-21", "T2M"),
          regionDemo("Konya soil moisture", "TUR", "TR-42", "GWETROOT"),
          regionDemo("Aswan temperature", "EGY", "EG-ASN", "T2M"),
          regionDemo("Amazonas rainfall", "BRA", "BR-AM", "PRECTOT"),
        ];
  }, [lang, pickCountry, pickAdmin1]);

  if (fatal) {
    return (
      <main className="splash">
        <h1>Data May Cry</h1>
        <p className="alert">{t(lang, "error")}: {fatal}</p>
      </main>
    );
  }
  if (!variables) {
    return (
      <main className="splash">
        <h1>Data May Cry</h1>
        <p>{t(lang, "loading")}</p>
      </main>
    );
  }
  const variable = variables.variables.find((x) => x.id === varId) ?? variables.variables[0];

  return (
    <div className="app">
      {!noGl && (
        <Globe
          mode={mode}
          trendTiles={trendTiles}
          showTrend={showTrend}
          continent={continent}
          countryId={countryId}
          admin1Id={admin1Id}
          cell={cell}
          markers={markers}
          view={view}
          onContinentOfCountry={setContinent}
          onPickCountry={pickCountry}
          onPickAdmin1={pickAdmin1}
          onPickCell={pickCell}
          onUnsupported={() => setNoGl(true)}
        />
      )}
      {noGl && <div className="globe fallback">{t(lang, "webgl")}</div>}

      <div className="brandbar">
        <Logo size={28} />
        <ViewTabs
          label={t(lang, "view")}
          value={mode}
          onChange={switchMode}
          tabs={[
            { id: "region", label: t(lang, "modeRegion"), icon: "globe", title: t(lang, "modeRegionSub") },
            { id: "point", label: t(lang, "modePoint"), icon: "grid", title: t(lang, "modePointSub") },
          ]}
        />
      </div>

      <StatusIsland lang={lang} status={status} variable={variable.name[lang]} onOpen={() => setTab("summary")} />

      <header className="top">
        {variables.is_mock && (
          <span className="mockbadge" data-tip={t(lang, "mockTip")}>
            {t(lang, "mock")}
          </span>
        )}
        <button className="icon-btn" onClick={copyLink} aria-label={t(lang, "share")} data-tip={t(lang, copied ? "copied" : "share")}>
          <Icon name="link" size={16} />
        </button>
        <button className="icon-btn" onClick={() => setMethodOpen(true)} aria-label={t(lang, "howItWorks")} data-tip={t(lang, "howItWorks")}>
          <Icon name="info" size={16} />
        </button>
        <button className="icon-btn lang" onClick={() => setLang(lang === "en" ? "tr" : "en")} aria-label="language" data-tip={lang === "en" ? "Türkçe" : "English"}>
          {lang === "en" ? "TR" : "EN"}
        </button>
      </header>

      <VariableDock lang={lang} variables={variables.variables} value={varId} suggested={question?.vars ?? []} onChange={setVarId} />

      <MethodDialog lang={lang} open={methodOpen} onClose={() => setMethodOpen(false)} />

      <div className="legend">
        <label>
          <input type="checkbox" checked={showTrend} onChange={(e) => setShowTrend(e.target.checked)} /> {t(lang, "trendMap")}
        </label>
        <div className="bar" style={{ background: PALETTE_CSS }} />
        <div className="ends">
          <span>{t(lang, "legendDown")}</span>
          <span>{t(lang, "legendUp")}</span>
        </div>
        <small>{t(lang, "legendFaint")}</small>
      </div>

      <Panel
        lang={lang}
        mode={mode}
        variables={variables}
        variable={variable}
        index={index}
        countryRows={countryRows}
        continent={continent}
        countryId={countryId}
        admin1Id={admin1Id}
        path={path}
        onScale={goToScale}
        area={area}
        target={target}
        trail={trail}
        onContinent={pickContinent}
        onCountry={pickCountry}
        onAdmin1={pickAdmin1}
        demos={demos}
        question={question}
        onQuestion={(q) => {
          setQuestion(q);
          if (q) setVarId(q.vars[0]);
        }}
        tab={tab}
        onTab={setTab}
        onStatus={setStatus}
      />
    </div>
  );
}
