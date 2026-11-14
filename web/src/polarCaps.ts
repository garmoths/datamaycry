/**
 * Real imagery on the polar caps of the globe.
 *
 * Web-Mercator tiles stop at ±85.05°, and the globe fills the two caps beyond that by
 * stretching the last pixel row of the edge tiles — a flat, textureless disc ~560 km across
 * (the "hole" at the poles). This custom WebGL layer draws the same NASA Blue Marble layer
 * there, fetched once per pole from NASA GIBS in its native polar stereographic projection
 * (EPSG:3413 Arctic, EPSG:3031 Antarctic). The cap fades in over 83.6°–84.4°, where both
 * pictures overlap, so there is no seam.
 *
 * The mesh is given in Web-Mercator coordinates (y < 0 beyond 85° north, > 1 beyond 85°
 * south) and placed on the sphere by MapLibre's own `projectTile` shader function, so it
 * moves, clips at the horizon and sorts with the map exactly like the tiles do.
 *
 * Written with AI assistance (Claude).
 */
import type { CustomLayerInterface, CustomRenderMethodInput, Map as MapLibreMap } from "maplibre-gl";

const WMS = (crs: string) =>
  `https://gibs.earthdata.nasa.gov/wms/epsg${crs}/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=BlueMarble_ShadedRelief_Bathymetry&STYLES=&FORMAT=image/jpeg`;

/** Cap from this latitude to the pole; fully opaque poleward of FADE_TO. */
const FROM = 83.4;
const FADE_FROM = 83.6;
const FADE_TO = 84.4;
/** Half-width of the fetched picture in projected metres (a little beyond FROM). */
const HALF = 770_000;
const SIZE = 2048;

// WGS84 ellipsoid
const A = 6378137;
const E = 0.0818191908426215;
const rad = (d: number) => (d * Math.PI) / 180;

/** Snyder's t(φ) for the polar stereographic projection, north-pole form. */
function tFn(phi: number): number {
  const s = E * Math.sin(phi);
  return Math.tan(Math.PI / 4 - phi / 2) / Math.pow((1 - s) / (1 + s), E / 2);
}

/**
 * Polar stereographic forward projection with a true-scale latitude (Snyder 1987, eq. 21-33…21-40).
 * North: EPSG:3413 (true scale 70°N, central meridian 45°W). South: EPSG:3031 (71°S, 0°).
 */
export function polarStereo(lat: number, lon: number, pole: "north" | "south"): [number, number] {
  const north = pole === "north";
  const latC = north ? 70 : 71;
  const lon0 = north ? -45 : 0;
  // the south pole is the north-pole form with latitude and longitude mirrored
  const phi = rad(north ? lat : -lat);
  const lam = rad(north ? lon - lon0 : -(lon - lon0));
  const phiC = rad(latC);
  const mc = Math.cos(phiC) / Math.sqrt(1 - E * E * Math.sin(phiC) ** 2);
  const rho = (A * mc * tFn(phi)) / tFn(phiC);
  const x = rho * Math.sin(lam);
  const y = -rho * Math.cos(lam);
  return north ? [x, y] : [-x, -y];
}

const mercX = (lon: number) => (lon + 180) / 360;
const mercY = (lat: number) => (180 - (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + rad(lat) / 2))) / 360;
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Interleaved vertices (mercator x, y, texture u, v, alpha) and triangle indices for one cap. */
export function capMesh(pole: "north" | "south"): { vertices: Float32Array; indices: Uint16Array } {
  const sign = pole === "north" ? 1 : -1;
  const lats: number[] = [];
  // dense rings where the fade happens, coarser towards the pole
  for (let d = FROM; d < 86; d += 0.2) lats.push(d);
  for (let d = 86; d < 89.99; d += 0.5) lats.push(d);
  lats.push(89.995);
  const COLS = 181; // every 2° of longitude, the last column repeats the first
  const v: number[] = [];
  for (const d of lats) {
    const lat = sign * d;
    const alpha = smooth(FADE_FROM, FADE_TO, d);
    for (let c = 0; c < COLS; c++) {
      const lon = -180 + c * 2;
      const [x, y] = polarStereo(lat, lon, pole);
      v.push(mercX(lon), mercY(lat), (x + HALF) / (2 * HALF), (HALF - y) / (2 * HALF), alpha);
    }
  }
  const idx: number[] = [];
  for (let r = 0; r + 1 < lats.length; r++)
    for (let c = 0; c + 1 < COLS; c++) {
      const a = r * COLS + c, b = a + 1, d = a + COLS, e = d + 1;
      idx.push(a, d, b, b, d, e);
    }
  return { vertices: new Float32Array(v), indices: new Uint16Array(idx) };
}

const VS = (prelude: string, define: string) => `#version 300 es
${prelude}
${define}
in vec2 a_pos;
in vec2 a_uv;
in float a_alpha;
out vec2 v_uv;
out float v_alpha;
void main() {
  gl_Position = projectTile(a_pos);
  v_uv = a_uv;
  v_alpha = a_alpha;
}`;

// same look as the "satellite" raster layer: saturation −0.15, brightness-max 0.92
const FS = `#version 300 es
precision highp float;
uniform sampler2D u_tex;
in vec2 v_uv;
in float v_alpha;
out vec4 frag;
void main() {
  vec3 c = texture(u_tex, v_uv).rgb;
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(c, vec3(l), 0.15) * 0.92;
  frag = vec4(c * v_alpha, v_alpha);
}`;

interface Cap {
  vao: WebGLVertexArrayObject;
  count: number;
  tex: WebGLTexture | null;
}

/** The custom layer. Add it right above the satellite imagery (below the trend colours). */
export function polarCapsLayer(): CustomLayerInterface {
  let map: MapLibreMap | null = null;
  const programs = new Map<string, WebGLProgram>();
  const caps: Partial<Record<"north" | "south", Cap>> = {};
  let alive = true;

  const compile = (gl: WebGL2RenderingContext, data: CustomRenderMethodInput["shaderData"]) => {
    let p = programs.get(data.variantName);
    if (p) return p;
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "polar cap shader");
      return s;
    };
    p = gl.createProgram()!;
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VS(data.vertexShaderPrelude, data.define)));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FS));
    // fixed attribute slots, shared with the VAOs built in onAdd
    gl.bindAttribLocation(p, 0, "a_pos");
    gl.bindAttribLocation(p, 1, "a_uv");
    gl.bindAttribLocation(p, 2, "a_alpha");
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? "polar cap program");
    programs.set(data.variantName, p);
    return p;
  };

  return {
    id: "polar-caps",
    type: "custom",
    renderingMode: "2d",
    onAdd(m, gl) {
      map = m;
      const g = gl as WebGL2RenderingContext;
      for (const pole of ["north", "south"] as const) {
        const { vertices, indices } = capMesh(pole);
        const vao = g.createVertexArray()!;
        g.bindVertexArray(vao);
        const vb = g.createBuffer();
        g.bindBuffer(g.ARRAY_BUFFER, vb);
        g.bufferData(g.ARRAY_BUFFER, vertices, g.STATIC_DRAW);
        const ib = g.createBuffer();
        g.bindBuffer(g.ELEMENT_ARRAY_BUFFER, ib);
        g.bufferData(g.ELEMENT_ARRAY_BUFFER, indices, g.STATIC_DRAW);
        // attribute slots: 0 position, 1 texture coordinate, 2 alpha (bound in compile)
        g.enableVertexAttribArray(0);
        g.vertexAttribPointer(0, 2, g.FLOAT, false, 20, 0);
        g.enableVertexAttribArray(1);
        g.vertexAttribPointer(1, 2, g.FLOAT, false, 20, 8);
        g.enableVertexAttribArray(2);
        g.vertexAttribPointer(2, 1, g.FLOAT, false, 20, 16);
        g.bindVertexArray(null);
        const cap: Cap = { vao, count: indices.length, tex: null };
        caps[pole] = cap;
        // the picture: same layer and date as the map tiles, in the pole's own projection
        const crs = pole === "north" ? "3413" : "3031";
        fetch(`${WMS(crs)}&CRS=EPSG:${crs}&BBOX=${-HALF},${-HALF},${HALF},${HALF}&WIDTH=${SIZE}&HEIGHT=${SIZE}`)
          .then((r) => {
            if (!r.ok) throw new Error(`polar imagery ${r.status}`);
            return r.blob();
          })
          .then((b) => createImageBitmap(b))
          .then((img) => {
            if (!alive) return;
            const t = g.createTexture();
            g.bindTexture(g.TEXTURE_2D, t);
            g.pixelStorei(g.UNPACK_FLIP_Y_WEBGL, false);
            g.pixelStorei(g.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
            g.texImage2D(g.TEXTURE_2D, 0, g.RGBA, g.RGBA, g.UNSIGNED_BYTE, img);
            g.generateMipmap(g.TEXTURE_2D);
            g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR_MIPMAP_LINEAR);
            g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR);
            g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE);
            g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE);
            cap.tex = t;
            map?.triggerRepaint();
          })
          .catch(() => {
            /* offline: the plain cap colour (Globe.tsx bm protocol) stays */
          });
      }
    },
    render(gl, args) {
      const g = gl as WebGL2RenderingContext;
      const ready = (["north", "south"] as const).map((k) => caps[k]).filter((c): c is Cap => !!c?.tex);
      if (!ready.length) return;
      const p = compile(g, args.shaderData);
      g.useProgram(p);
      const d = args.defaultProjectionData;
      const u = (name: string) => g.getUniformLocation(p, name);
      g.uniformMatrix4fv(u("u_projection_matrix"), false, Float32Array.from(d.mainMatrix));
      g.uniformMatrix4fv(u("u_projection_fallback_matrix"), false, Float32Array.from(d.fallbackMatrix));
      g.uniform4f(u("u_projection_tile_mercator_coords"), ...d.tileMercatorCoords);
      g.uniform4f(u("u_projection_clipping_plane"), ...d.clippingPlane);
      g.uniform1f(u("u_projection_transition"), d.projectionTransition);
      g.uniform1i(u("u_tex"), 0);
      g.disable(g.DEPTH_TEST);
      g.disable(g.CULL_FACE);
      g.enable(g.BLEND);
      g.blendFunc(g.ONE, g.ONE_MINUS_SRC_ALPHA);
      g.activeTexture(g.TEXTURE0);
      for (const cap of ready) {
        g.bindTexture(g.TEXTURE_2D, cap.tex);
        g.bindVertexArray(cap.vao);
        g.drawElements(g.TRIANGLES, cap.count, g.UNSIGNED_SHORT, 0);
      }
      g.bindVertexArray(null);
    },
    onRemove(_m, gl) {
      alive = false;
      const g = gl as WebGL2RenderingContext;
      for (const cap of Object.values(caps)) {
        if (!cap) continue;
        g.deleteVertexArray(cap.vao);
        if (cap.tex) g.deleteTexture(cap.tex);
      }
      for (const p of programs.values()) g.deleteProgram(p);
      programs.clear();
    },
  };
}
