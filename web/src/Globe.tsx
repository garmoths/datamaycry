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
import { Map as MapLibreMap, NavigationControl, Popup, setWorkerUrl, type GeoJSONSource, type ImageSource, type MapMouseEvent } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
// The worker file is served untouched by the plugin in vite.config.ts.
setWorkerUrl(`${new URL(`${import.meta.env.BASE_URL}maplibre-worker/maplibre-gl-worker.mjs`, location.href)}`);
import { IMAGE_COORDS } from "./trendImage.ts";
import { cellOf } from "./data.ts";
import { globeChecker, gridLines, loadBoundaries, nodeBounds, WORLD, type Bounds, type Node } from "./geo.ts";

/** A place with data, drawn as an orange dot in the region view. */
export interface Marker {
  id: string;
  country: string;
  /** admin-1 id, or null for a whole country */
  admin1: string | null;
  label: string;
  lat: number;
  lon: number;
}

export interface View {
  bounds: Bounds;
  /** Changing the key flies the camera. */
  key: string;
}

interface Props {
  mode: "region" | "point";
  trendImage: string | null;
  showTrend: boolean;
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

const NONE = ["==", ["get", "id"], ""] as never;
/** opacity `on` while the feature has feature-state hover = true, else invisible */
const HOVER = (on: number) => ["case", ["boolean", ["feature-state", "hover"], false], on, 0];
const REGION_LAYERS = ["admin1-fill", "countries-fill"];
const EMPTY = { type: "FeatureCollection", features: [] } as const;

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
      zoom: 1.35,
      minZoom: 0.8,
      maxPitch: 60,
      attributionControl: { compact: true, customAttribution: "Boundaries: Natural Earth · Data: NASA MERRA-2" },
    });
    mapRef.current = map;
    if (import.meta.env.DEV) (window as unknown as { __map: MapLibreMap }).__map = map; // for debugging in the console
    map.addControl(new NavigationControl({ visualizePitch: true }), "bottom-left");
    // keep the globe centred in the space the side panel leaves free
    const pad = () => {
      const wide = window.innerWidth > 900;
      map.setPadding({ top: 40, left: 0, right: wide ? 460 : 0, bottom: wide ? 0 : 340 });
    };
    pad();
    window.addEventListener("resize", pad);

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

      // Real-world basemap: NASA Blue Marble (shaded relief + bathymetry) from NASA GIBS,
      // public, no key, CORS-enabled; native up to z8 and stretched beyond.
      map.addSource("satellite", {
        type: "raster",
        tiles: [
          "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/2004-08-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg",
        ],
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
      add({ id: "continent-fill", type: "fill", source: "countries", filter: NONE, paint: { "fill-color": "#4a8dff", "fill-opacity": 0.28 } });
      add({ id: "countries-line", type: "line", source: "countries", paint: { "line-color": "#ffffff", "line-opacity": 0.35, "line-width": ["interpolate", ["linear"], ["zoom"], 0, 0.3, 5, 1] } });
      add({ id: "country-hover", type: "fill", source: "countries", paint: { "fill-color": "#ffffff", "fill-opacity": HOVER(0.18) } });
      add({ id: "country-selected", type: "line", source: "countries", filter: NONE, paint: { "line-color": "#ffd166", "line-width": 2.2 } });
      add({ id: "admin1-fill", type: "fill", source: "admin1", filter: NONE, paint: { "fill-color": "#ffffff", "fill-opacity": 0.06 } });
      add({ id: "admin1-line", type: "line", source: "admin1", filter: NONE, paint: { "line-color": "#c9d6f2", "line-width": 0.8 } });
      add({ id: "admin1-hover", type: "fill", source: "admin1", paint: { "fill-color": "#ffffff", "fill-opacity": HOVER(0.22) } });
      add({ id: "admin1-selected", type: "line", source: "admin1", filter: NONE, paint: { "line-color": "#ffd166", "line-width": 2.6 } });
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
      // Region view: orange dots where data exists (soft halo + core)
      add({ id: "markers-halo", type: "circle", source: "markers", paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, 7, 6, 14], "circle-color": "#ff8c32", "circle-opacity": 0.22, "circle-blur": 0.6 } });
      add({
        id: "markers-dot",
        type: "circle",
        source: "markers",
        paint: {
          // zoom must be the outermost input; hover enlarges the dot at every zoom
          "circle-radius": [
            "interpolate", ["linear"], ["zoom"],
            1, ["case", ["boolean", ["feature-state", "hover"], false], 6, 3.5],
            6, ["case", ["boolean", ["feature-state", "hover"], false], 9, 6],
          ],
          "circle-color": ["case", ["get", "selected"], "#ffd166", "#ff8c32"],
          // white rim keeps the dot readable on top of the orange "rising" trend colours
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2,
        },
      });

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
    map.setFilter("continent-fill", mode === "region" ? eq("continent", continent) : NONE);
    map.setFilter("country-selected", mode === "region" ? eq("id", countryId) : NONE);
    map.setFilter("admin1-line", mode === "region" && countryId ? (["==", ["get", "country"], countryId] as never) : NONE);
    map.setFilter("admin1-fill", mode === "region" && countryId ? (["==", ["get", "country"], countryId] as never) : NONE);
    map.setFilter("admin1-selected", mode === "region" ? eq("id", admin1Id) : NONE);
    if (mode === "region" && (continent || countryId)) spin.current = false;
  }, [ready, mode, continent, countryId, admin1Id]);

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

  // ── region view: orange markers where data exists ──
  const { markers } = props;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const on = mode === "region";
    (map.getSource("markers") as GeoJSONSource).setData({
      type: "FeatureCollection",
      features: on
        ? markers.map((m) => ({
            type: "Feature",
            properties: { ...m, selected: m.admin1 ? m.admin1 === admin1Id : m.country === countryId && !admin1Id },
            geometry: { type: "Point", coordinates: [m.lon, m.lat] },
          }))
        : [],
    } as never);
  }, [ready, mode, markers, countryId, admin1Id]);

  // ── trend raster ──
  const { trendImage, showTrend } = props;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !trendImage) return;
    const src = map.getSource("trend") as ImageSource | undefined;
    if (src) src.updateImage({ url: trendImage, coordinates: IMAGE_COORDS });
    else {
      map.addSource("trend", { type: "image", url: trendImage, coordinates: IMAGE_COORDS });
      map.addLayer(
        { id: "trend", type: "raster", source: "trend", // linear resampling + the smooth field from trendImage.ts = no visible blocks at any zoom
          paint: { "raster-opacity": ["interpolate", ["linear"], ["zoom"], 0, 0.85, 4, 0.7, 7, 0.4], "raster-fade-duration": 400, "raster-resampling": "linear" } } as never,
        "continent-fill",
      );
    }
  }, [ready, trendImage]);
  useEffect(() => {
    const map = mapRef.current;
    if (map && ready && map.getLayer("trend")) map.setLayoutProperty("trend", "visibility", showTrend ? "visible" : "none");
  }, [ready, showTrend, trendImage]);

  // ── camera ──
  const { view } = props;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    if (view.bounds === WORLD) {
      map.easeTo({ zoom: 1.35, pitch: 0, bearing: 0, center: [map.getCenter().lng, 25], duration: 900 });
      return;
    }
    map.fitBounds(view.bounds, {
      padding: 40, // the side panel is already excluded via map.setPadding
      duration: 1100, // snappy but still readable as a flight
      maxZoom: 9,
      pitch: 0,
    });
  }, [ready, view.key]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={box} className="globe" />;
}
