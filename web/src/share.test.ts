/** Shareable link format. Written with AI assistance (Claude). */
import { describe, expect, it } from "vitest";
import { readLink, writeLink, type LinkState } from "./share.ts";
import { fold } from "./fold.ts";

describe("share links", () => {
  it("round-trips a region and a grid cell", () => {
    const region: LinkState = { v: "T2M", m: "region", c: "TUR", a: "TR-21" };
    expect(readLink(writeLink(region))).toEqual(region);
    const point: LinkState = { v: "PRECTOT", m: "point", cell: [256, 352] };
    expect(writeLink(point)).toBe("#v=PRECTOT&m=point&cell=256,352");
    expect(readLink(writeLink(point))).toEqual(point);
  });
  it("ignores anything malformed instead of trusting it", () => {
    expect(readLink("#v=<script>&m=evil&c=turkey&a=x&cell=999,-1")).toEqual({});
  });
});

describe("place search folding", () => {
  it("matches Turkish names typed without special letters", () => {
    expect(fold("Diyarbakır")).toBe("diyarbakir");
    expect(fold("İstanbul")).toBe("istanbul");
    expect(fold("São Paulo")).toBe("sao paulo");
  });
});
