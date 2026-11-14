// Written with AI assistance (Claude).
import { describe, expect, it, vi } from "vitest";

vi.mock("maplibre-gl", () => ({ addProtocol: () => {} }));
const { workerIndex } = await import("./trendImage.ts");

describe("tile worker pool", () => {
  it("the same tile always goes to the same worker (its PNG cache hits)", () => {
    expect(workerIndex(5, 17, 11, 3)).toBe(workerIndex(5, 17, 11, 3));
  });
  it("a zoom step's tiles are spread over all workers", () => {
    const count = [0, 0, 0];
    for (let x = 0; x < 16; x++) for (let y = 0; y < 16; y++) count[workerIndex(4, x, y, 3)]++;
    for (const c of count) expect(c).toBeGreaterThan(256 / 3 / 2); // no worker gets less than half its share
  });
  it("one worker gets everything when the pool has one", () => {
    expect(workerIndex(6, 40, 21, 1)).toBe(0);
  });
});
