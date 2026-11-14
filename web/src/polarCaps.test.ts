/** Polar cap mesh and projection. Written with AI assistance (Claude). */
import { describe, expect, it } from "vitest";
import { capMesh, polarStereo } from "./polarCaps.ts";

describe("polar stereographic projection", () => {
  it("puts the poles at the origin", () => {
    for (const pole of ["north", "south"] as const) {
      const [x, y] = polarStereo(pole === "north" ? 90 : -90, 12, pole);
      expect(Math.hypot(x, y)).toBeLessThan(1e-6);
    }
  });
  it("is true to scale on its standard parallel (EPSG:3413 at 70°N, EPSG:3031 at 71°S)", () => {
    // on the true-scale parallel the radius is a·cosφ / √(1 − e² sin²φ)
    const e2 = 0.0818191908426215 ** 2;
    const r = (lat: number) => {
      const p = (lat * Math.PI) / 180;
      return (6378137 * Math.cos(p)) / Math.sqrt(1 - e2 * Math.sin(p) ** 2);
    };
    expect(Math.hypot(...polarStereo(70, 10, "north"))).toBeCloseTo(r(70), 3);
    expect(Math.hypot(...polarStereo(-71, 10, "south"))).toBeCloseTo(r(71), 3);
  });
  it("orients the axes like the EPSG definitions", () => {
    // EPSG:3413: 45°W points straight down; EPSG:3031: 0° points straight up
    const [xn, yn] = polarStereo(80, -45, "north");
    expect(Math.abs(xn)).toBeLessThan(1e-6);
    expect(yn).toBeLessThan(0);
    const [xs, ys] = polarStereo(-80, 0, "south");
    expect(Math.abs(xs)).toBeLessThan(1e-6);
    expect(ys).toBeGreaterThan(0);
    // and 90°E is to the right in both
    expect(polarStereo(80, 45, "north")[0]).toBeGreaterThan(0);
    expect(polarStereo(-80, 90, "south")[0]).toBeGreaterThan(0);
  });
});

describe("cap mesh", () => {
  it("reaches beyond the tiles' edge, stays inside the picture and fades in", () => {
    for (const pole of ["north", "south"] as const) {
      const { vertices, indices } = capMesh(pole);
      const n = vertices.length / 5;
      expect(Math.max(...indices)).toBeLessThan(n);
      let minY = Infinity, maxY = -Infinity;
      for (let k = 0; k < n; k++) {
        const [, y, u, v, a] = vertices.slice(k * 5, k * 5 + 5);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
        expect(u).toBeGreaterThanOrEqual(0);
        expect(u).toBeLessThanOrEqual(1);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
        expect(a).toBeGreaterThanOrEqual(0);
        expect(a).toBeLessThanOrEqual(1);
      }
      // Web-Mercator tiles stop at y = 0 (85.05°N) and y = 1 (85.05°S): the cap must cover beyond
      if (pole === "north") expect(minY).toBeLessThan(-0.5);
      else expect(maxY).toBeGreaterThan(1.5);
      // first ring transparent (blends into the tiles), last ring opaque
      expect(vertices[4]).toBe(0);
      expect(vertices[vertices.length - 1]).toBe(1);
    }
  });
});
