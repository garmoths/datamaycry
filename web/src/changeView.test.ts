// Written with AI assistance (Claude).
import { describe, expect, it, vi } from "vitest";
import { asView, setChangeView, viewDecimals, viewUnit } from "./changeView.ts";

describe("per decade or total", () => {
  it("total = slope per decade × decades of the period", () => {
    expect(asView(0.42, "total", [1980, 2025])).toBeCloseTo(1.89, 6); // Diyarbakır ≈ +1.9 °C
    expect(asView(0.42, "decade", [1980, 2025])).toBe(0.42);
    expect(asView(-0.5, "total", [1990, 2010])).toBeCloseTo(-1, 6);
  });
  it("labels say what the number is", () => {
    expect(viewUnit("tr", "°C", "decade", [1980, 2025])).toBe("°C / 10 yıl");
    expect(viewUnit("en", "mm/day", "total", [1993, 2015])).toBe("mm/day · 1993–2015");
  });
  it("totals use one decimal fewer", () => {
    expect(viewDecimals("decade", 1)).toBe(2);
    expect(viewDecimals("total", 1)).toBe(1);
  });
  it("the choice is remembered", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) });
    setChangeView("total");
    expect(localStorage.getItem("dmc-change")).toBe("total");
    setChangeView("decade");
    expect(localStorage.getItem("dmc-change")).toBe("decade");
    vi.unstubAllGlobals();
  });
});
