/** Number formatting on the result card. Written with AI assistance (Claude). */
import { describe, expect, it } from "vitest";
import { noTrendText, smartFixed, smartSigned } from "./i18n.ts";

describe("smartFixed", () => {
  it("keeps the variable's decimals for ordinary numbers", () => {
    expect(smartFixed(0.61, 2)).toBe("0.61");
    expect(smartFixed(12.345, 1)).toBe("12.3");
  });
  it("never prints a small non-zero change as 0.00", () => {
    expect(smartFixed(0.004, 2)).toBe("0.0040");
    expect(smartSigned(-0.0004, 2)).toBe("-0.00040");
  });
  it("prints zero as zero", () => {
    expect(smartFixed(0, 2)).toBe("0.00");
  });
  it("no-trend sentence shows the real size of a tiny slope", () => {
    expect(noTrendText("en", 0.004, "mm/day", 2)).toContain("+0.0040 mm/day");
  });
});
