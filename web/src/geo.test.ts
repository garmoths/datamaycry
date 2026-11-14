/** The Point-mode scale ladder must line up with the data grid. Written with AI assistance (Claude). */
import { describe, expect, it } from "vitest";
import { cellOf, tileOf } from "./data.ts";
import { bboxOf, CELL_LEVEL, children, dataTileOf, gridLines, nodeBounds, nodeCenter, pathToCell, WORLD_NODE, type Node } from "./geo.ts";
import { bspline, buildField, cellAlpha, evidence, mercatorLat, polarBlend, renderTile, trendColor } from "./trendImage.ts";

describe("trend field", () => {
  it("places Mercator rows at the right latitude", () => {
    expect(mercatorLat(0.5)).toBeCloseTo(0, 6); // equator
    expect(mercatorLat(0)).toBeCloseTo(85.0511, 3); // top edge
  });
  it("renders a tile: data → colour, no data → transparent", () => {
    const N = 361 * 576;
    const slope = new Float32Array(N).fill(NaN);
    const level = new Uint8Array(N).fill(255);
    const pValue = new Float32Array(N).fill(NaN);
    // a strongly rising patch around 0°N 0°E (row 180, column 288)
    for (let i = 170; i <= 190; i++) for (let j = 278; j <= 298; j++) { slope[i * 576 + j] = 1; level[i * 576 + j] = 2; pValue[i * 576 + j] = 1e-4; }
    const grid = { nlat: 361, nlon: 576, lat0: -90, lon0: -180, dlat: 0.5, dlon: 0.625 } as const;
    const field = buildField({ grid, slopePerDecade: slope, level, pValue });
    // z=1 tile x=1,y=0 covers 0…180°E, 0…85°N; its bottom-left corner is the patch
    const px = renderTile(field, 1, 1, 0, 64);
    const at = (c: number, r: number) => px[(r * 64 + c) * 4 + 3];
    expect(at(0, 63)).toBeGreaterThan(100); // inside the patch: opaque, warm
    expect(px[(63 * 64) * 4]).toBeGreaterThan(px[(63 * 64) * 4 + 2]); // red > blue
    expect(at(40, 10)).toBe(0); // far away: no data
  });
  it("colours the pole caps with one uniform colour (no bald disc, no streaks)", () => {
    const N = 361 * 576;
    const slope = new Float32Array(N);
    const level = new Uint8Array(N).fill(2);
    const pValue = new Float32Array(N).fill(1e-4);
    // rising everywhere, and the polar rows vary along longitude
    for (let k = 0; k < N; k++) slope[k] = 0.6 + 0.4 * Math.sin(((k % 576) / 576) * 2 * Math.PI * 5);
    const grid = { nlat: 361, nlon: 576, lat0: -90, lon0: -180, dlat: 0.5, dlon: 0.625 } as const;
    const field = buildField({ grid, slopePerDecade: slope, level, pValue });
    for (const [x, y] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      const px = renderTile(field, 1, x, y, 64);
      const edge = y === 0 ? 0 : 63; // the row the globe stretches over the pole
      const row = Array.from({ length: 64 }, (_, c) => [...px.slice((edge * 64 + c) * 4, (edge * 64 + c) * 4 + 4)]);
      expect(row[0][3]).toBeGreaterThan(100); // coloured, not transparent
      for (const p of row) for (let q = 0; q < 4; q++) expect(Math.abs(p[q] - row[0][q])).toBeLessThanOrEqual(2);
    }
  });
  it("is neutral at zero and saturates at the ends", () => {
    expect(trendColor(0).map(Math.round)).toEqual([240, 240, 236]);
    expect(trendColor(5).map(Math.round)).toEqual([202, 72, 48]);
    expect(trendColor(-5).map(Math.round)).toEqual([33, 102, 172]);
  });
  it("B-spline weights sum to 1 and never go negative (no colour overshoot)", () => {
    for (const t of [0, 0.25, 0.5, 0.99]) {
      const w = bspline(t);
      expect(w.reduce((a, b) => a + b)).toBeCloseTo(1, 10);
      expect(Math.min(...w)).toBeGreaterThanOrEqual(0);
    }
  });
  it("blends into one cap colour towards the poles", () => {
    expect(polarBlend(60)).toBe(0);
    expect(polarBlend(-80)).toBeGreaterThan(0);
    expect(polarBlend(-80)).toBeLessThan(1);
    expect(polarBlend(84.6)).toBe(1);
  });
  it("fades small or unproven changes so the Earth shows through", () => {
    expect(cellAlpha(evidence(1e-4), 1)).toBeGreaterThan(cellAlpha(evidence(0.03), 1));
    expect(cellAlpha(evidence(0.03), 1)).toBeGreaterThan(cellAlpha(evidence(0.5), 1));
    expect(cellAlpha(evidence(1e-4), 0.05)).toBeLessThan(cellAlpha(evidence(1e-4), 1) / 2);
  });
  it("evidence changes smoothly across p = 0.05 (no hard edge)", () => {
    expect(evidence(0.051) - evidence(0.049)).toBeLessThan(0.01);
    expect(evidence(0.5)).toBe(0);
    expect(evidence(1e-5)).toBe(1);
  });
});

function descend(level: number): Node[] {
  let nodes = [WORLD_NODE];
  for (let l = 0; l < level; l++) nodes = nodes.flatMap(children);
  return nodes;
}

describe("whole-globe cell grid", () => {
  it("draws every meridian edge and every parallel edge inside ±85°", () => {
    const lines = gridLines().features;
    const meridians = lines.filter((f) => f.geometry.coordinates[0][0] === f.geometry.coordinates[1][0]);
    expect(meridians).toHaveLength(576);
    expect(meridians.filter((f) => f.properties.level === 1)).toHaveLength(12); // 30° blocks
    expect(meridians.filter((f) => f.properties.level <= 2)).toHaveLength(36); // 10° data tiles
  });

  it("pathToCell walks down to exactly that cell, through its data tile", () => {
    const { i, j } = cellOf(37.9, 40.2); // Diyarbakır
    const path = pathToCell(i, j);
    expect(path).toHaveLength(CELL_LEVEL + 1);
    expect(path[CELL_LEVEL]).toMatchObject({ i0: i, j0: j, ni: 1, nj: 1 });
    expect(dataTileOf(path[2])).toEqual(tileOf(i, j));
  });
});

describe("scale ladder", () => {
  it("each level tiles its parent exactly (no gaps, no overlap)", () => {
    for (let l = 1; l <= CELL_LEVEL; l++) {
      const cells = descend(l).reduce((sum, n) => sum + n.ni * n.nj, 0);
      expect(cells).toBe(361 * 576);
    }
  });

  it("has the planned counts: 72 blocks, 648 data tiles, every grid cell", () => {
    expect(descend(1)).toHaveLength(72);
    expect(descend(2)).toHaveLength(648);
    expect(descend(CELL_LEVEL)).toHaveLength(361 * 576);
  });

  it("level 2 is exactly the contract's 10° data tile (incl. 21-row pole tile)", () => {
    for (const t of descend(2)) {
      const { ty, tx } = tileOf(t.i0, t.j0);
      expect(dataTileOf(t)).toEqual({ ty, tx });
      expect(t.i0).toBe(ty * 20);
      expect(t.j0).toBe(tx * 16);
      expect(t.nj).toBe(16);
      expect(t.ni).toBe(ty === 17 ? 21 : 20);
      // every cell inside maps back to this tile
      expect(tileOf(t.i0 + t.ni - 1, t.j0 + t.nj - 1)).toEqual({ ty, tx });
    }
  });

  it("a cell-level node is one grid cell centred on its grid point", () => {
    const cells = descend(CELL_LEVEL);
    for (const c of [cells[0], cells[12345], cells[cells.length - 1]]) {
      expect(c.ni * c.nj).toBe(1);
      const { lat, lon } = nodeCenter(c);
      expect(cellOf(lat, lon)).toMatchObject({ i: c.i0, j: c.j0 });
      const [w, s, e, n] = nodeBounds(c);
      expect(e - w).toBeCloseTo(0.625);
      if (c.i0 > 0 && c.i0 < 360) expect(n - s).toBeCloseTo(0.5);
    }
  });
});

describe("bboxOf across the antimeridian", () => {
  it("frames Chukotka-like shapes around 180° instead of the whole world", () => {
    const f = {
      type: "Feature",
      properties: {},
      geometry: { type: "MultiPolygon", coordinates: [[[[170, 60], [180, 60], [180, 70], [170, 70], [170, 60]]], [[[-180, 60], [-170, 60], [-170, 70], [-180, 70], [-180, 60]]]] },
    } as const;
    const [w, s, e, n] = bboxOf([f as never]);
    expect(e - w).toBeCloseTo(20);
    expect([s, n]).toEqual([60, 70]);
  });
  it("leaves ordinary countries alone", () => {
    const f = { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[[26, 36], [45, 36], [45, 42], [26, 42], [26, 36]]] } } as const;
    expect(bboxOf([f as never])).toEqual([26, 36, 45, 42]);
  });
});
