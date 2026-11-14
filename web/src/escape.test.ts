// Written with AI assistance (Claude).
import { describe, expect, it } from "vitest";
import { escapeStep, type EscState } from "./escape.ts";

const base: EscState = { overlay: false, typing: false, drawer: false, timeTravel: false, depth: 1, customPeriod: false };

describe("Esc key", () => {
  it("closes the top thing first: drawer, then time travel, then one place level, then the period", () => {
    const all = { ...base, drawer: true, timeTravel: true, depth: 4, customPeriod: true };
    expect(escapeStep(all)).toBe("drawer");
    expect(escapeStep({ ...all, drawer: false })).toBe("timeTravel");
    expect(escapeStep({ ...all, drawer: false, timeTravel: false })).toBe("up");
    expect(escapeStep({ ...all, drawer: false, timeTravel: false, depth: 1 })).toBe("period");
  });
  it("steps up the place trail one level per press", () => {
    expect(escapeStep({ ...base, depth: 4 })).toBe("up"); // province
    expect(escapeStep({ ...base, depth: 2 })).toBe("up"); // continent
  });
  it("does nothing at the world with the whole period", () => {
    expect(escapeStep(base)).toBeNull();
  });
  it("leaves Esc to the palette, the dialog and text fields", () => {
    expect(escapeStep({ ...base, drawer: true, overlay: true })).toBeNull();
    expect(escapeStep({ ...base, depth: 3, typing: true })).toBeNull();
  });
});
