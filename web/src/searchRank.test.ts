// Written with AI assistance (Claude).
import { describe, expect, it } from "vitest";
import { hitRank } from "./searchRank.ts";
import { fold } from "./fold.ts";

const item = (key: string, label: string, en = label) => ({ key, label, text: fold(`${en} ${label}`) });

describe("search order", () => {
  it("the exact name wins: 'Rusya' is the country, not 'Rusya (diğer alanlar)'", () => {
    const f = fold("Rusya");
    const list = [item("a:RUS+99?", "Rusya (diğer alanlar)", "Russia (other areas)"), item("c:RUS", "Rusya", "Russia"), item("c:BLR", "Beyaz Rusya", "Belarus")];
    const sorted = [...list].sort((a, b) => hitRank(b, f) - hitRank(a, f));
    expect(sorted[0].key).toBe("c:RUS");
  });
  it("names that start with the query come before names that only contain it", () => {
    const f = fold("Ank");
    expect(hitRank(item("a:TR-06", "Ankara"), f)).toBeGreaterThan(hitRank(item("a:X", "Bankara"), f));
  });
  it("at an equal match a country comes before a province", () => {
    const f = fold("Georgia");
    expect(hitRank(item("c:GEO", "Georgia"), f)).toBeGreaterThan(hitRank(item("a:US-GA", "Georgia"), f));
  });
});
