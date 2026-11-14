/** Number formatting on the result card. Written with AI assistance (Claude). */
import { describe, expect, it } from "vitest";
import { cardText, chanceText, meaningHead, noTrendText, smartFixed, smartSigned } from "./i18n.ts";

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
  it("no-trend sentence names no direction and no slope", () => {
    const s = noTrendText("tr", { start: 1980, end: 2025 });
    expect(s).toContain("belirgin bir değişim yok");
    expect(s).not.toMatch(/\d,\d|artış görünüyor|azalış görünüyor/);
  });
});

describe("plain-language card", () => {
  const base = { level: "strong" as const, place: "Diyarbakır", unit: "°C", ci: [0.24, 0.61] as [number, number],
    p: 0.0001, total: 1.9, startYear: 1980, endYear: 2025, decimals: 1 };
  it("says what the change means, with a Turkish decimal comma and no p-value jargon", () => {
    const s = cardText("tr", { ...base, varId: "T2M", variable: "Hava sıcaklığı", dir: "up", slope: 0.42 });
    expect(s).toBe("1980–2025 arasında toplam yaklaşık 1,9 °C ısınmış. " +
      "Gerçek eğim büyük ihtimalle 10 yılda 0,24 ile 0,61 °C arası; şans eseri olma ihtimali binde birden az.");
    expect(s).not.toContain("Diyarbakır"); // the title already names the place
    expect(meaningHead("tr", "T2M", "up")).toBe("Isınıyor");
    expect(meaningHead("en", "GWETROOT", "down")).toBe("The soil is drying out");
  });
  it("a fall reads as a positive-sized change with the right verb and range", () => {
    const s = cardText("en", { ...base, varId: "SNOMAS", variable: "Snow", unit: "mm", dir: "down", slope: -16.1,
      ci: [-25.8, -6.9], total: -72.4, decimals: 0 });
    expect(s).toContain("has decreased by about 72 mm in total");
    expect(s).toContain("7 to 26 mm per decade");
    expect(s).not.toContain("-");
  });
  it("a likely change admits uncertainty", () => {
    const s = cardText("tr", { ...base, level: "possible", varId: "PRECTOT", variable: "Yağış", unit: "mm/gün",
      dir: "down", slope: -0.05, ci: [-0.09, -0.01], p: 0.03, total: -0.2, decimals: 2 });
    expect(s).toContain("yüzde beşten az");
    expect(s).toContain("kanıt henüz kesin değil");
  });
  it("Turkish puts the percent sign first", () => {
    const s = cardText("tr", { level: "strong", place: "Konya", unit: "%", ci: [-0.9, -0.2], p: 0.001, total: -2,
      startYear: 1980, endYear: 2025, decimals: 1, varId: "GWETROOT", variable: "Toprak nemi", dir: "down", slope: -0.5 });
    expect(s).toContain("toplam yaklaşık %2,0 kurumuş");
    expect(s).toContain("%0,20 ile %0,90 arası");
  });
  it("chance in words", () => {
    expect(chanceText("en", 0.0004)).toBe("less than 1 in 1,000");
    expect(chanceText("tr", 0.2)).toBe("yaklaşık yüzde 20");
  });
});
