/** The Point-mode scale ladder must line up with the data grid. Written with AI assistance (Claude). */
import { describe, expect, it } from "vitest";
import { cellOf, tileOf } from "./data.ts";
import { CELL_LEVEL, children, dataTileOf, gridLines, nodeBounds, nodeCenter, pathToCell, WORLD_NODE, type Node } from "./geo.ts";
import { cellAlpha, IMAGE_COORDS, latForMercatorY, trendColor } from "./trendImage.ts";

describe("trend field", () => {
  it("places Mercator rows at the right latitude", () => {
    expect(latForMercatorY(1023.5, 2048)).toBeCloseTo(0, 5); // equator
    expect(latForMercatorY(-0.5, 2048)).toBeCloseTo(IMAGE_COORDS[0][1], 5); // top edge = 85.05°N
  });
  it("is neutral at zero and saturates at the ends", () => {
    expect(trendColor(0).map(Math.round)).toEqual([240, 240, 236]);
    expect(trendColor(5).map(Math.round)).toEqual([202, 72, 48]);
    expect(trendColor(-5).map(Math.round)).toEqual([33, 102, 172]);
  });
  it("fades small or unproven changes so the Earth shows through", () => {
    expect(cellAlpha(2, 1)).toBeGreaterThan(cellAlpha(1, 1));
    expect(cellAlpha(1, 1)).toBeGreaterThan(cellAlpha(0, 1));
    expect(cellAlpha(2, 0.05)).toBeLessThan(cellAlpha(2, 1) / 2);
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
