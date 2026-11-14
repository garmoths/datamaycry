// Written with AI assistance (Claude).
import { describe, expect, it } from "vitest";
import { lightPosition } from "./glassLight.ts";

describe("glass light", () => {
  it("is placed where the pointer is, inside the bar", () => {
    expect(lightPosition(130.4, 52.6, { left: 100, top: 40 })).toEqual({ mx: "30px", my: "13px" });
  });
  it("works at the bar's corner", () => {
    expect(lightPosition(100, 40, { left: 100, top: 40 })).toEqual({ mx: "0px", my: "0px" });
  });
});
