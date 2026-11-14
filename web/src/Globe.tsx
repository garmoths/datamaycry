/**
 * The 3D globe (MapLibre GL, globe projection — PLAN.md decision #11).
 *
 * Region mode: continents (camera + highlight), countries, provinces, and orange
 *   markers on every place that has data.
 * Tile view: every MERRA-2 cell edge drawn over the whole globe at once (bold 30°/10°
 *   lines, fine 2.5°/cell lines). Click anywhere → that grid cell is chosen directly.
 *
 * Written with AI assistance (Claude).
 */
import { useEffect, useRef, useState } from "react";
import { EMPTY_STATE, endFade, finishLoad, startLoad, visibility, type TrendLayerState } from "./trendLayers.ts";
import { tilesInView } from "./tiles.ts";
import { Map as MapLibreMap, NavigationControl, Popup, addProtocol, setWorkerUrl, type GeoJSONSource, type MapMouseEvent, type RasterTileSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
// The worker file is served untouched by the plugin in vite.config.ts.
setWorkerUrl(`${new URL(`${import.meta.env.BASE_URL}maplibre-worker/maplibre-gl-worker.mjs`, location.href)}`);
import { cellOf } from "./data.ts";
import { moveSky } from "./sky.ts";
import { polarCapsLayer } from "./polarCaps.ts";
import { globeChecker, gridLines, loadAdmin1, loadBoundaries, nodeBounds, onAdmin1Change, WORLD, type Bounds, type Node } from "./geo.ts";

/** A place with data, drawn as an orange dot in the region view. */
export interface Marker {
  id: string;
  country: string;
  /** admin-1 id, or null for a whole country */
  admin1: string | null;
  label: string;
  lat: number;
  lon: number;
  /** true when the place also has its own monthly series (drawn with a brighter core) */
  series?: boolean;
}

export interface View {
  bounds: Bounds;
  /** Changing the key flies the camera. */
  key: string;
}

interface Props {
  mode: "region" | "point";
  /** tile URL template of the trend layer (trendImage.ts), null = none */
  trendTiles: string | null;
  showTrend: boolean;
  /** 1.4 animation: tile URL of the year to show; null = animation off (trend map back) */
  animTiles?: string | null;
  /** the year's tiles are on screen (double-buffered swap done) */
  onAnimShown?: (url: string) => void;
  /** tile URLs of the next year(s), loaded ahead in hidden layers */
  animAhead?: string[];
  /** tiles in view at the current zoom, reported after every move while animating (for preloading) */
  onViewTiles?: (tiles: { z: number; x: number; y: number }[]) => void;
  continent: string | null;
  countryId: string | null;
  admin1Id: string | null;
  /** Tile view: the chosen grid cell */
  cell: Node | null;
  markers: Marker[];
  view: View;
  onContinentOfCountry: (continent: string) => void;
  onPickCountry: (id: string) => void;
  onPickAdmin1: (country: string, id: string) => void;
  /** Tile view: grid cell (i, j) was clicked */
  onPickCell: (i: number, j: number) => void;
  onUnsupported: () => void;
}

/** room for the variable rail (left) and the side panel (right); App.css .deck uses the same */
const GLOBE_PAD_LEFT = 84;
const GLOBE_PAD_RIGHT = 408;

const NONE = ["==", ["get", "id"], ""] as never;
/** opacity `on` while the feature has feature-state hover = true, else invisible */
const HOVER = (on: number) => ["case", ["boolean", ["feature-state", "hover"], false], on, 0];
const REGION_LAYERS = ["admin1-fill", "countries-fill"];
const EMPTY = { type: "FeatureCollection", features: [] } as const;
const ANOM_LAYERS = ["anomA", "anomB", "anomC"];
const TREND_LAYERS = ["trendA", "trendB"];
const TREND_OPACITY = ["interpolate", ["linear"], ["zoom"], 0, 0.85, 4, 0.72, 7, 0.45] as never;
const FADE_MS = 450; // cross-fade between two variables
const TILE_FADE_MS = 180; // one new tile over its parent while zooming
const ANOM_MAXZOOM = 3;
const ANOM_OPACITY = ["interpolate", ["linear"], ["zoom"], 0, 0.9, 4, 0.78, 7, 0.5] as never;

interface Ring {
  front: string | null;
  url: Record<string, string | null>;
  loaded: Record<string, boolean>;
  want: string | null;
}

/** Make one ring layer the visible one and report its year as shown. */
function showLayer(map: MapLibreMap, r: Ring, id: string, shown?: (url: string) => void) {
  for (const l of ANOM_LAYERS) map.setPaintProperty(l, "raster-opacity", l === id ? ANOM_OPACITY : 0);
  r.front = id;
  r.want = null;
  const url = r.url[id];
  if (url) shown?.(url);
}

/** The ring layer holding `url`, or a free one (not in `avoid`) that starts loading it. */
function loadLayer(map: MapLibreMap, r: Ring, url: string, avoid: (string | null)[]): string | null {
  const have = ANOM_LAYERS.find((l) => r.url[l] === url);
  if (have) return have;
  const free = ANOM_LAYERS.find((l) => !avoid.includes(l));
  if (!free) return null; // every layer is busy: skip this prefetch
  r.url[free] = url;
  r.loaded[free] = false;
  (map.getSource(free) as RasterTileSource).setTiles([url]);
  return free;
}

/**
 * Web-Mercator tiles end at ±85°, and the globe fills the pole caps by stretching the last
 * pixel row of the top/bottom tiles into a fan — which shows as streaks over Antarctica.
 * The "bm" protocol loads the NASA tile and, for those edge tiles only, blends the last
 * rows into one uniform colour measured from Blue Marble (ice south, ocean north), so the
 * fan is a smooth plain colour. All other tiles pass through untouched.
 */
const GIBS = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/2004-08-01/GoogleMapsCompatible_Level8";
const POLE_RGB = { north: [13, 36, 76], south: [233, 234, 234] } as const;
let protocolAdded = false;
function addBlueMarbleProtocol() {
  if (protocolAdded) return;
  protocolAdded = true;
  addProtocol("bm", async (params, abort) => {
    const [z, x, y] = params.url.replace("bm://", "").split("/").map(Number);
    const res = await fetch(`${GIBS}/${z}/${y}/${x}.jpeg`, { signal: abort.signal });
    if (!res.ok) throw new Error(`Blue Marble tile ${res.status}`);
    const last = 2 ** z - 1;
    if (y !== 0 && y !== last) return { data: await res.arrayBuffer() };
    const img = await createImageBitmap(await res.blob());
    const c = new OffscreenCanvas(img.width, img.height);
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    const north = y === 0;
    const [r, g, b] = north ? POLE_RGB.north : POLE_RGB.south;
    const band = Math.round(img.height * 0.12); // ~ the last degree before ±85°
    const grad = ctx.createLinearGradient(0, north ? 0 : img.height, 0, north ? band : img.height - band);
    grad.addColorStop(0, `rgba(${r},${g},${b},1)`);
    grad.addColorStop(0.15, `rgba(${r},${g},${b},1)`);
    grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, north ? 0 : img.height - band, img.width, band);
    const out = await c.convertToBlob({ type: "image/png" });
    return { data: await out.arrayBuffer() };
  });
}

function hasWebGL2(): boolean {
  try {
    return !!document.createElement("canvas").getContext("webgl2");
  } catch {
    return false;
  }
}

export function Globe(props: Props) {
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const latest = useRef(props);
  useEffect(() => {
    latest.current = props; // event handlers below always read the newest props
  });
  const [ready, setReady] = useState(false);
  const spin = useRef(true);

  // ── create the map once ──
  useEffect(() => {
    if (!box.current) return;
    if (!hasWebGL2()) {
      latest.current.onUnsupported();
      return;
    }
    const map = new MapLibreMap({
      container: box.current,
      style: {
        version: 8,
        projection: { type: "globe" },
        sources: {},
        layers: [{ id: "ocean", type: "background", paint: { "background-color": "#0a2240" } }],
      } as never,
      center: [30, 30],
      zoom: 1.6,
      minZoom: 0.8,
      maxPitch: 60,
      // no on-map attribution button: the credits (NASA MERRA-2, Blue Marble/GIBS, Natural Earth)
      // are listed in the Sources drawer and the "How it works" dialog
      attributionControl: false,
      // phones and tablets report 3× pixels: 2× looks the same and draws less than half as many
      pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
    });
    mapRef.current = map;
    if (import.meta.env.DEV) (window as unknown as { __map: MapLibreMap }).__map = map; // for debugging in the console
    map.addControl(new NavigationControl({ visualizePitch: true }), "bottom-right"); // right: the variable rail owns the left edge
    // keep the globe centred in the space the side panel leaves free
    const pad = () => {
      const wide = window.innerWidth > 900;
      // right: the analysis column (≈ 400 px); bottom: the variable dock; on phones the
      // column becomes a sheet over the lower half
      map.setPadding(
        wide
          ? { top: 64, left: GLOBE_PAD_LEFT, right: GLOBE_PAD_RIGHT, bottom: 92 }
          : // phones and tablets: below the top bars and the period scale (~190 px), above the
            // variable bar and the bottom sheet (46 % of the height)
            { top: 190, left: 0, right: 0, bottom: Math.round(window.innerHeight * 0.46) + 66 },
      );
    };
    pad();
    window.addEventListener("resize", pad);
    // the container can change size without a window resize (side panes, emulation, zoom):
    // without this the canvas keeps its old size and the edges stay black
    const ro = new ResizeObserver(() => {
      pad();
      map.resize();
    });
    ro.observe(box.current);

    map.on("load", async () => {
      try {
        map.setSky({
          "sky-color": "#1a4a8a",
          "horizon-color": "#8ec5ff",
          "fog-color": "#0b1530",
          "sky-horizon-blend": 0.6,
          "horizon-fog-blend": 0.8,
          "fog-ground-blend": 0.2,
          "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 1, 5, 1, 7, 0],
        } as never);
      } catch {
        /* atmosphere is optional */
      }
      const b = await loadBoundaries();
      // promoteId lets hover use feature-state (cheap) instead of re-filtering layers on every mouse move;
      // maxzoom/tolerance keep the worker from re-tiling detailed borders at every zoom step
      map.addSource("countries", { type: "geojson", data: b.countries as never, promoteId: "id", maxzoom: 7, tolerance: 0.5 });
      map.addSource("admin1", { type: "geojson", data: b.admin1 as never, promoteId: "id", maxzoom: 9, tolerance: 0.4 });
      map.addSource("point", { type: "geojson", data: EMPTY as never });
      map.addSource("hovercell", { type: "geojson", data: EMPTY as never });
      map.addSource("checker", { type: "geojson", data: globeChecker() as never });
      map.addSource("cells", { type: "geojson", data: gridLines() as never, maxzoom: 6 });
      map.addSource("markers", { type: "geojson", data: EMPTY as never, promoteId: "id" });

      addBlueMarbleProtocol();
      // Real-world basemap: NASA Blue Marble (shaded relief + bathymetry) from NASA GIBS,
      // public, no key, CORS-enabled; native up to z8 and stretched beyond.
      map.addSource("satellite", {
        type: "raster",
        tiles: ["bm://{z}/{x}/{y}"], // NASA GIBS via addBlueMarbleProtocol (pole seam fix)
        tileSize: 256,
        maxzoom: 8,
        attribution: "Imagery: NASA Blue Marble · GIBS",
      });

      const add = (l: object) => map.addLayer(l as never);
      // plain land stays underneath as the offline fallback; the photo covers it when it loads
      add({ id: "countries-fill", type: "fill", source: "countries", paint: { "fill-color": "#22324f", "fill-opacity": 1 } });
      add({
        id: "satellite",
        type: "raster",
        source: "satellite",
        paint: { "raster-fade-duration": 250, "raster-saturation": -0.15, "raster-brightness-max": 0.92, "raster-contrast": 0.05 },
      });
      add({ id: "continent-fill", type: "fill", source: "countries", filter: NONE, paint: { "fill-color": "#93c5fd", "fill-opacity": 0.1 } }); // light tint: never hide the imagery
      // borders: round joins/caps and zoom-scaled widths read as smooth curves, not jagged steps
      add({ id: "countries-line", type: "line", source: "countries", layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": "#ffffff", "line-opacity": ["interpolate", ["linear"], ["zoom"], 1, 0.22, 5, 0.4], "line-width": ["interpolate", ["exponential", 1.4], ["zoom"], 1, 0.35, 5, 0.9, 9, 1.6], "line-blur": 0.3 } });
      add({ id: "country-hover", type: "fill", source: "countries", paint: { "fill-color": "#ffffff", "fill-opacity": HOVER(0.18) } });
      add({ id: "country-selected-glow", type: "line", source: "countries", filter: NONE, layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": "#6ef3ff", "line-opacity": 0.28, "line-width": ["interpolate", ["linear"], ["zoom"], 2, 5, 8, 10], "line-blur": 4 } });
      add({ id: "country-selected", type: "line", source: "countries", filter: NONE, layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": "#6ef3ff", "line-width": ["interpolate", ["linear"], ["zoom"], 2, 1.3, 8, 2.4] } });
      // invisible: only there so clicks and hover can find provinces
      add({ id: "admin1-fill", type: "fill", source: "admin1", filter: NONE, paint: { "fill-color": "#ffffff", "fill-opacity": 0 } });
      add({ id: "admin1-line", type: "line", source: "admin1", filter: NONE, layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": "#dbeafe", "line-opacity": 0.55, "line-width": ["interpolate", ["linear"], ["zoom"], 3, 0.5, 9, 1.2], "line-blur": 0.3 } });
      add({ id: "admin1-hover", type: "fill", source: "admin1", paint: { "fill-color": "#6ef3ff", "fill-opacity": HOVER(0.2) } });
      add({ id: "admin1-selected-fill", type: "fill", source: "admin1", filter: NONE, paint: { "fill-color": "#6ef3ff", "fill-opacity": 0.14 } });
      add({ id: "admin1-selected-glow", type: "line", source: "admin1", filter: NONE, layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": "#6ef3ff", "line-opacity": 0.35, "line-width": 9, "line-blur": 5 } });
      add({ id: "admin1-selected", type: "line", source: "admin1", filter: NONE, layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": "#6ef3ff", "line-width": ["interpolate", ["linear"], ["zoom"], 3, 1.6, 9, 2.8] } });
      // Tile view: the whole globe as squared paper, all scales at once.
      // 10° data tiles shaded like a chessboard …
      const hidden = { visibility: "none" };
      add({ id: "checker-fill", type: "fill", source: "checker", layout: hidden, paint: { "fill-color": ["case", ["get", "odd"], "#ffffff", "#000000"], "fill-opacity": ["case", ["get", "odd"], 0.07, 0.1] } });
      // … and every MERRA-2 cell edge as a meridian/parallel line; coarse lines bold, cell lines fine
      add({
        id: "cells-line",
        type: "line",
        source: "cells",
        layout: hidden,
        paint: {
          "line-color": ["match", ["get", "level"], 1, "#ffd166", 2, "#8ec5ff", 3, "#b8f2c9", "#dbe5ff"],
          "line-width": ["match", ["get", "level"], 1, 1.4, 2, 1, 0.5],
          "line-opacity": [
            "interpolate", ["linear"], ["zoom"],
            1, ["match", ["get", "level"], 1, 0.75, 2, 0.45, 3, 0.18, 0.07],
            5, ["match", ["get", "level"], 1, 0.9, 2, 0.7, 3, 0.45, 0.3],
          ],
        },
      });
      add({ id: "hovercell-fill", type: "fill", source: "hovercell", paint: { "fill-color": "#ffd166", "fill-opacity": 0.3 } });
      add({ id: "hovercell-line", type: "line", source: "hovercell", paint: { "line-color": "#ffd166", "line-width": 1.5 } });
      add({ id: "cell-fill", type: "fill", source: "point", filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": "#ffd166", "fill-opacity": 0.5 } });
      add({ id: "cell-line", type: "line", source: "point", filter: ["==", ["geometry-type"], "Polygon"], paint: { "line-color": "#ffffff", "line-width": 2 } });
      add({ id: "point-dot", type: "circle", source: "point", filter: ["==", ["geometry-type"], "Point"], paint: { "circle-radius": 5, "circle-color": "#ffd166", "circle-stroke-color": "#08060d", "circle-stroke-width": 2 } });
      // Region view: one orange dot per province of the chosen country (soft halo + core).
      // Opacities start at 0 and fade in each time the dots change (see the markers effect).
      const fade = { duration: 550, delay: 0 };
      add({ id: "markers-halo", type: "circle", source: "markers", paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, 5, 4, 9, 8, 15], "circle-color": "#ff8c32", "circle-opacity": 0, "circle-opacity-transition": fade, "circle-blur": 0.75 } });
      add({
        id: "markers-dot",
        type: "circle",
        source: "markers",
        paint: {
          // zoom must be the outermost input; hover enlarges the dot at every zoom
          "circle-radius": [
            "interpolate", ["linear"], ["zoom"],
            1, ["case", ["boolean", ["feature-state", "hover"], false], 4.5, 2.4],
            4, ["case", ["boolean", ["feature-state", "hover"], false], 6.5, 3.6],
            8, ["case", ["boolean", ["feature-state", "hover"], false], 9, 5.5],
          ],
          "circle-color": ["case", ["get", "selected"], "#6ef3ff", ["get", "series"], "#ffb347", "#ff8c32"],
          "circle-opacity": 0,
          "circle-opacity-transition": fade,
          // white rim keeps the dot readable on top of the orange "rising" trend colours
          "circle-stroke-color": ["case", ["get", "selected"], "#04121a", "#ffffff"],
          "circle-stroke-width": ["case", ["get", "selected"], 2, 1.2],
          "circle-stroke-opacity": 0,
          "circle-stroke-opacity-transition": fade,
        },
      });

      // real NASA imagery on the two polar caps the tiles cannot reach (below the trend colours)
      map.addLayer(polarCapsLayer(), "continent-fill");

      setReady(true);
    });

    // user takes the wheel → stop the idle spin
    const stop = () => (spin.current = false);
    for (const ev of ["mousedown", "touchstart", "wheel"] as const) map.on(ev, stop);

    // idle spin: one step per animation frame (smooth), time-based (same speed at 60 or 144 Hz),
    // paused in background tabs and for people who prefer reduced motion
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) spin.current = false;
    let raf = 0;
    let lastT = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = lastT ? Math.min(now - lastT, 100) : 0;
      lastT = now;
      if (!spin.current || document.hidden || map.isMoving() || map.getZoom() > 3) return;
      const c = map.getCenter();
      map.setCenter([c.lng + dt * 0.004, c.lat]);
    };
    raf = requestAnimationFrame(tick);

    // the star field drifts with the camera
    map.on("move", () => {
      const c = map.getCenter();
      moveSky(c.lng, c.lat);
    });

    map.on("click", (e: MapMouseEvent) => {
      const p = latest.current;
      if (p.mode === "point") {
        const { i, j } = cellOf(e.lngLat.lat, e.lngLat.lng);
        return p.onPickCell(i, j);
      }
      const m = map.getLayer("markers-dot") && map.queryRenderedFeatures(e.point, { layers: ["markers-dot"] })[0];
      if (m) {
        const { country, admin1 } = m.properties as { country: string; admin1: string };
        if (admin1) return p.onPickAdmin1(country, admin1);
        return p.onPickCountry(country);
      }
      const hit = map.queryRenderedFeatures(e.point, {
        layers: REGION_LAYERS.filter((id) => map.getLayer(id)),
      });
      const a1 = hit.find((h) => h.layer.id === "admin1-fill" && p.countryId);
      if (a1) return p.onPickAdmin1(a1.properties.country, a1.properties.id);
      const c = hit.find((h) => h.layer.id === "countries-fill");
      if (c) {
        p.onContinentOfCountry(c.properties.continent);
        p.onPickCountry(c.properties.id);
      }
    });

    // Hover: at most one query per frame, and only the feature-state flag changes.
    let hovered: { source: string; id: string | number } | null = null;
    const setHover = (next: { source: string; id: string | number } | null) => {
      if (hovered && next && hovered.source === next.source && hovered.id === next.id) return;
      if (hovered) map.setFeatureState(hovered, { hover: false });
      if (next) map.setFeatureState(next, { hover: true });
      hovered = next;
      map.getCanvas().style.cursor = next ? "pointer" : "";
    };
    const tip = new Popup({ closeButton: false, closeOnClick: false, offset: 10, className: "tip" });
    let hoverCell = "";
    let pending: MapMouseEvent | null = null;
    map.on("mousemove", (e: MapMouseEvent) => {
      if (!pending)
        requestAnimationFrame(() => {
          const ev = pending;
          pending = null;
          if (!ev || !map.getLayer("hovercell-fill")) return;
          const p = latest.current;
          if (p.mode === "point") {
            // highlight the one grid cell under the mouse (a single polygon, cheap)
            const c = cellOf(ev.lngLat.lat, ev.lngLat.lng);
            const key = `${c.i}:${c.j}`;
            if (key !== hoverCell) {
              hoverCell = key;
              const [w, s, east, n] = nodeBounds({ level: 4, i0: c.i, j0: c.j, ni: 1, nj: 1 });
              (map.getSource("hovercell") as GeoJSONSource).setData({
                type: "Feature",
                properties: {},
                geometry: { type: "Polygon", coordinates: [[[w, s], [east, s], [east, n], [w, n], [w, s]]] },
              } as never);
              tip.setLngLat([c.lon, c.lat]).setText(`${c.lat.toFixed(2)}°, ${c.lon.toFixed(2)}° · i ${c.i} · j ${c.j}`).addTo(map);
            }
            map.getCanvas().style.cursor = "crosshair";
            return;
          }
          const m = map.queryRenderedFeatures(ev.point, { layers: ["markers-dot"] })[0];
          if (m) {
            setHover({ source: "markers", id: m.properties.id as string });
            tip.setLngLat(ev.lngLat).setText(m.properties.label as string).addTo(map);
            return;
          }
          tip.remove();
          const hit = map.queryRenderedFeatures(ev.point, { layers: REGION_LAYERS });
          const a1 = hit.find((h) => h.layer.id === "admin1-fill" && p.countryId);
          const c = hit.find((h) => h.layer.id === "countries-fill");
          setHover(a1 ? { source: "admin1", id: a1.properties.id } : c ? { source: "countries", id: c.properties.id } : null);
        });
      pending = e;
    });
    map.on("mouseout", () => {
      setHover(null);
      tip.remove();
      hoverCell = "";
      (map.getSource("hovercell") as GeoJSONSource | undefined)?.setData(EMPTY as never);
    });

    return () => {
      window.removeEventListener("resize", pad);
      ro.disconnect();
      cancelAnimationFrame(raf);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // ── selection highlights ──
  const { mode, continent, countryId, admin1Id } = props;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const eq = (key: string, v: string | null) => (v ? ["==", ["get", key], v] : ["==", ["get", "id"], ""]) as never;
    // tint the continent only while choosing a country in it; once a country is chosen, the imagery stays clean
    map.setFilter("continent-fill", mode === "region" && !countryId ? eq("continent", continent) : NONE);
    map.setFilter("country-selected", mode === "region" ? eq("id", countryId) : NONE);
    map.setFilter("country-selected-glow", mode === "region" && !admin1Id ? eq("id", countryId) : NONE);
    map.setFilter("admin1-line", mode === "region" && countryId ? (["==", ["get", "country"], countryId] as never) : NONE);
    map.setFilter("admin1-fill", mode === "region" && countryId ? (["==", ["get", "country"], countryId] as never) : NONE);
    map.setFilter("admin1-selected", mode === "region" ? eq("id", admin1Id) : NONE);
    map.setFilter("admin1-selected-glow", mode === "region" ? eq("id", admin1Id) : NONE);
    map.setFilter("admin1-selected-fill", mode === "region" ? eq("id", admin1Id) : NONE);
    if (mode === "region" && (continent || countryId)) spin.current = false;
  }, [ready, mode, continent, countryId, admin1Id]);

  // ── provinces are fetched per country (geo.ts loadAdmin1); redraw when a file arrives ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const redraw = () =>
      void loadBoundaries().then((b) => (map.getSource("admin1") as GeoJSONSource | undefined)?.setData(b.admin1 as never));
    redraw();
    return onAdmin1Change(redraw);
  }, [ready]);
  useEffect(() => {
    if (mode === "region" && countryId) void loadAdmin1(countryId);
  }, [mode, countryId]);

  // ── tile view: whole-globe grid + selected cell ──
  const { cell } = props;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const on = mode === "point";
    for (const id of ["checker-fill", "cells-line"]) map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
    if (!on) (map.getSource("hovercell") as GeoJSONSource).setData(EMPTY as never);
    const box = (b: Bounds) => {
      const [w, s, e, n] = [b[0], Math.max(b[1], -85), b[2], Math.min(b[3], 85)];
      return { type: "Polygon", coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] };
    };
    const b = cell ? nodeBounds(cell) : null;
    (map.getSource("point") as GeoJSONSource).setData(
      (on && b
        ? {
            type: "FeatureCollection",
            features: [
              { type: "Feature", properties: {}, geometry: box(b) },
              { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2] } },
            ],
          }
        : EMPTY) as never,
    );
    if (on && cell) spin.current = false;
  }, [ready, mode, cell]);

  // ── region view: orange dots for the chosen country's provinces ──
  const { markers } = props;
  const markerSet = useRef("");
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const on = mode === "region";
    const list = on ? markers : [];
    // a new set of dots (another country) fades in; a selection change inside the same set does not blink
    const key = `${list.length}:${list[0]?.id ?? ""}:${list[list.length - 1]?.id ?? ""}`;
    const fresh = key !== markerSet.current;
    markerSet.current = key;
    const show = (o: number) => {
      map.setPaintProperty("markers-halo", "circle-opacity", o * 0.22);
      map.setPaintProperty("markers-dot", "circle-opacity", o);
      map.setPaintProperty("markers-dot", "circle-stroke-opacity", o);
    };
    if (fresh) show(0);
    (map.getSource("markers") as GeoJSONSource).setData({
      type: "FeatureCollection",
      features: list.map((m) => ({
        type: "Feature",
        properties: { ...m, series: !!m.series, selected: m.admin1 ? m.admin1 === admin1Id : m.country === countryId && !admin1Id },
        geometry: { type: "Point", coordinates: [m.lon, m.lat] },
      })),
    } as never);
    if (!fresh) {
      // same dots again (a selection, or another country's file landing): make sure they are
      // visible even if this run cancelled the fade-in timer of the run before
      show(1);
      return;
    }
    const id = window.setTimeout(() => show(1), 60);
    return () => window.clearTimeout(id);
  }, [ready, mode, markers, countryId, admin1Id]);

  // ── trend raster: two layers, the new variable loads hidden and cross-fades in when ready ──
  // Only the layers that are needed draw (trendLayers.ts): a hidden layer loads no tiles, so
  // a zoom paints each tile once, not twice.
  const { trendTiles, showTrend } = props;
  const animShown = !!props.animTiles;
  const trendState = useRef<TrendLayerState>(EMPTY_STATE);
  const trendOn = useRef(showTrend && !animShown);
  useEffect(() => {
    trendOn.current = showTrend && !animShown;
  });
  const applyTrend = (map: MapLibreMap) => {
    const vis = visibility(TREND_LAYERS, trendState.current, trendOn.current);
    for (const id of TREND_LAYERS) if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", vis[id]);
  };
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !trendTiles) return;
    if (!map.getSource(TREND_LAYERS[0])) {
      // a tiled source is subdivided properly on the globe (no seam) and each tile is
      // computed for its own zoom (no pixelation); beyond z6 MapLibre scales smoothly
      for (const id of TREND_LAYERS) {
        map.addSource(id, { type: "raster", tiles: [trendTiles], tileSize: 256, maxzoom: 6 });
        map.addLayer(
          {
            id,
            type: "raster",
            source: id,
            layout: { visibility: "none" },
            paint: {
              "raster-opacity": 0,
              "raster-opacity-transition": { duration: FADE_MS, delay: 0 },
              // new tiles of a zoom level blend in over their parent instead of popping
              "raster-fade-duration": TILE_FADE_MS,
              "raster-resampling": "linear",
            },
          } as never,
          "continent-fill",
        );
      }
    }
    // the old map stays on screen until every tile of the new one is ready
    const { state, back } = startLoad(TREND_LAYERS, trendState.current);
    trendState.current = state;
    map.setPaintProperty(back, "raster-opacity", 0);
    (map.getSource(back) as RasterTileSource).setTiles([trendTiles]);
    applyTrend(map);
    let done = false;
    let fade: ReturnType<typeof setTimeout> | undefined;
    const swap = () => {
      if (done) return;
      done = true;
      const old = trendState.current.front;
      trendState.current = finishLoad(trendState.current);
      map.setPaintProperty(back, "raster-opacity", TREND_OPACITY);
      if (old && old !== back) map.setPaintProperty(old, "raster-opacity", 0);
      applyTrend(map);
      map.off("sourcedata", onData);
      clearTimeout(timer);
      fade = setTimeout(() => {
        trendState.current = endFade(trendState.current);
        applyTrend(map);
      }, FADE_MS + 50);
    };
    const onData = (e: { sourceId?: string; sourceDataType?: string }) => {
      if (e.sourceId === back && e.sourceDataType !== "metadata" && map.isSourceLoaded(back)) swap();
    };
    map.on("sourcedata", onData);
    const timer = setTimeout(swap, 2000); // never keep the old variable forever
    return () => {
      done = true;
      map.off("sourcedata", onData);
      clearTimeout(timer);
      clearTimeout(fade);
    };
  }, [ready, trendTiles]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const map = mapRef.current;
    if (map && ready) applyTrend(map);
  }, [ready, showTrend, trendTiles, animShown]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 1.4 animation: a ring of three raster layers ──
  // The year on screen sits in one layer; the next year(s) load ahead in the others, so a
  // step is usually an instant opacity swap. A year is only shown once its tiles are loaded.
  const { animTiles, animAhead, onAnimShown, onViewTiles } = props;
  const ring = useRef<Ring>({ front: null, url: {}, loaded: {}, want: null });
  const shownCb = useRef(onAnimShown);
  useEffect(() => {
    shownCb.current = onAnimShown;
  }, [onAnimShown]);

  // create the layers once and keep "loaded" up to date
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !animTiles || map.getSource(ANOM_LAYERS[0])) return;
    for (const id of ANOM_LAYERS) {
      // 1° data: tiles above z3 add nothing, MapLibre scales them up smoothly
      map.addSource(id, { type: "raster", tiles: [animTiles], tileSize: 256, maxzoom: ANOM_MAXZOOM });
      map.addLayer(
        { id, type: "raster", source: id, paint: { "raster-opacity": 0, "raster-fade-duration": 0, "raster-resampling": "linear" } } as never,
        "continent-fill",
      );
      ring.current.url[id] = null;
      ring.current.loaded[id] = false;
    }
    const onData = (e: { sourceId?: string; sourceDataType?: string }) => {
      const r = ring.current;
      const id = e.sourceId;
      if (!id || !(id in r.url) || e.sourceDataType === "metadata" || !map.isSourceLoaded(id)) return;
      r.loaded[id] = true;
      if (r.want === id) showLayer(map, r, id, shownCb.current);
    };
    map.on("sourcedata", onData);
  }, [ready, animTiles]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    if (!animTiles) {
      for (const id of ANOM_LAYERS) if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", "none");
      ring.current.want = null;
      return;
    }
    if (!map.getSource(ANOM_LAYERS[0])) return; // created by the effect above, runs again on next change
    for (const id of ANOM_LAYERS) map.setLayoutProperty(id, "visibility", "visible");
    spin.current = false; // a spinning globe needs new tiles every frame: hold still while playing
    const r = ring.current;
    const target = loadLayer(map, r, animTiles, [r.front]) ?? ANOM_LAYERS.find((l) => l !== r.front)!;
    if (r.loaded[target]) showLayer(map, r, target, shownCb.current);
    else r.want = target;
    // start loading what comes next, without touching what is on screen or awaited
    for (const next of animAhead ?? []) loadLayer(map, r, next, [r.front, target, ...ANOM_LAYERS.filter((l) => r.url[l] && (animAhead ?? []).includes(r.url[l]!))]);
    const timer = setTimeout(() => r.want === target && showLayer(map, r, target, shownCb.current), 1500); // never stall
    return () => clearTimeout(timer);
  }, [ready, animTiles, animAhead, showTrend]); // eslint-disable-line react-hooks/exhaustive-deps

  // tiles in view, for preloading every year of the animation
  const tilesCb = useRef(onViewTiles);
  useEffect(() => {
    tilesCb.current = onViewTiles;
  }, [onViewTiles]);
  const animOn = !!animTiles;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !animOn) return;
    const report = () => {
      const b = map.getBounds();
      tilesCb.current?.(tilesInView({ west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() }, map.getZoom(), ANOM_MAXZOOM));
    };
    report();
    map.on("moveend", report);
    return () => {
      map.off("moveend", report);
    };
  }, [ready, animOn]);

  // ── camera ──
  const { view } = props;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    if (view.bounds === WORLD) {
      map.easeTo({ zoom: 1.6, pitch: 0, bearing: 0, center: [map.getCenter().lng, 25], duration: 900 });
      return;
    }
    map.fitBounds(view.bounds, {
      padding: 70, // room around the place; the side column is already excluded via map.setPadding
      duration: 1100, // snappy but still readable as a flight
      maxZoom: 9,
      pitch: 0,
    });
  }, [ready, view.key]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={box} className="globe" />;
}
