import { useCallback, useEffect, useMemo, useState } from "react";
import { preloadPlotly } from "./plotlyLoader.ts";
import { VariablePicker } from "./VariablePicker.tsx";
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
import { Panel, type CountryRow, type Target } from "./Panel.tsx";
import { renderTrendImage, COLD, WARM } from "./trendImage.ts";
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
import { rasterizeContinents, summarize } from "./continentStats.ts";
import "./App.css";

const rgb = (c: readonly number[]) => `rgb(${c[0]},${c[1]},${c[2]})`;
const trendImages = new Map<VarId, string | null>();

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
  const [trendImage, setTrendImage] = useState<string | null>(null);
  const [trendMap, setTrendMap] = useState<TrendMap | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [noGl, setNoGl] = useState(false);
  const [methodOpen, setMethodOpen] = useState(false);

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
        // painting + PNG-encoding costs ~70 ms; switching back to a variable is instant
        let img = trendImages.get(varId);
        if (img === undefined) trendImages.set(varId, (img = renderTrendImage(m)));
        setTrendImage(img);
      })
      .catch(() => {
        if (dead) return;
        setTrendMap(null);
        setTrendImage(null);
      });
    return () => {
      dead = true;
    };
  }, [varId]);

  const countryRows: CountryRow[] = useMemo(
    () => bounds?.countries.features.map((f) => f.properties).filter((c) => c.id && c.id !== "-99") ?? [],
    [bounds],
  );
  // which continent each grid cell is on (computed once from the borders)
  const continentGrid = useMemo(() => (bounds ? rasterizeContinents(bounds) : null), [bounds]);
  const continentSummary = useMemo(() => {
    const idx = CONTINENTS.findIndex((c) => c.id === continent);
    return trendMap && continentGrid && idx >= 0 ? summarize(trendMap, continentGrid, idx) : null;
  }, [trendMap, continentGrid, continent]);

  const flyTo = useCallback((b: Bounds, key: string) => setView({ bounds: b, key }), []);

  const reset = useCallback(() => {
    setContinent(null);
    setCountryId(null);
    setAdmin1Id(null);
    setPath([WORLD_NODE]);
    flyTo(WORLD, `world:${Date.now()}`);
  }, [flyTo]);

  const pickContinent = useCallback(
    (id: string) => {
      setContinent(id);
      setCountryId(null);
      setAdmin1Id(null);
      flyTo(CONTINENTS.find((c) => c.id === id)!.bbox, `cont:${id}`);
    },
    [flyTo],
  );

  const pickCountry = useCallback(
    (id: string) => {
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
      if (!bounds) return;
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

  const target: Target = useMemo(() => {
    if (mode === "point") return point ? { type: "point", lat: point.lat, lon: point.lon } : null;
    if (!countryId || !index.some((c) => c.id === countryId)) return null;
    return { type: "region", country: countryId, admin1: admin1Id };
  }, [mode, point, countryId, admin1Id, index]);

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
          trendImage={trendImage}
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

      <div className="topleft">
        <div className="brand">
          <strong>{t(lang, "title")}</strong>
          <span>{t(lang, "tagline")}</span>
        </div>
        <fieldset className="views">
          <legend>{t(lang, "view")}</legend>
          {(["region", "point"] as const).map((m) => (
            <button key={m} className={`view ${mode === m ? "on" : ""}`} aria-pressed={mode === m} onClick={() => switchMode(m)}>
              <span className="view-icon" aria-hidden>
                {m === "region" ? "🌍" : "▦"}
              </span>
              <span className="view-text">
                <strong>{t(lang, m === "region" ? "modeRegion" : "modePoint")}</strong>
                <small>{t(lang, m === "region" ? "modeRegionSub" : "modePointSub")}</small>
              </span>
            </button>
          ))}
        </fieldset>
        <VariablePicker lang={lang} variables={variables.variables} value={varId} onChange={setVarId} />
      </div>

      <header className="top">
        <button className="seg-btn" onClick={() => setMethodOpen(true)}>
          ⓘ {t(lang, "howItWorks")}
        </button>
        <button className="seg-btn" onClick={() => setLang(lang === "en" ? "tr" : "en")} aria-label="language">
          {lang === "en" ? "TR" : "EN"}
        </button>
        {variables.is_mock && <span className="mockbadge">{t(lang, "mock")}</span>}
      </header>

      <MethodDialog lang={lang} open={methodOpen} onClose={() => setMethodOpen(false)} />

      <div className="legend">
        <label>
          <input type="checkbox" checked={showTrend} onChange={(e) => setShowTrend(e.target.checked)} /> {t(lang, "trendMap")}
        </label>
        <div className="bar" style={{ background: `linear-gradient(90deg, ${rgb(COLD)}, #ececec, ${rgb(WARM)})` }} />
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
        continentSummary={continentSummary}
        target={target}
        trail={trail}
        onContinent={pickContinent}
        onCountry={pickCountry}
        onAdmin1={pickAdmin1}
        demos={demos}
      />
    </div>
  );
}
