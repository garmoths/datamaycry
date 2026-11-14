/** Small Turkish grammar helpers. Written with AI assistance (Claude). */

/**
 * Turkish locative / ablative suffix for a year as it is read aloud ("1998'de", "2010'da",
 * "2003'te", "1990'dan"): vowel harmony and hardening follow the last spoken word.
 */
export function yearSuffix(year: number, kind: "de" | "den"): string {
  // last spoken word → [back vowel?, ends in a hard consonant?]
  const ones: Record<number, [boolean, boolean]> = {
    1: [false, false], 2: [false, false], 3: [false, true], 4: [false, true], 5: [false, true],
    6: [true, false], 7: [false, false], 8: [false, false], 9: [true, false],
  };
  const tens: Record<number, [boolean, boolean]> = {
    1: [true, false], 2: [false, false], 3: [true, false], 4: [true, true], 5: [false, false],
    6: [true, true], 7: [false, true], 8: [false, false], 9: [true, false],
  };
  const [back, hard] =
    year % 10 ? ones[year % 10] : year % 100 ? tens[(year / 10) % 10] : year % 1000 ? [false, false] /* yüz */ : [false, false] /* bin */;
  const c = hard ? "t" : "d";
  const v = back ? "a" : "e";
  return `${year}'${c}${v}${kind === "den" ? "n" : ""}`;
}
