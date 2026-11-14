/** Text folding for search. Written with AI assistance (Claude). */

/** lower-case, no accents, Turkish dotless ı → i, so "diyarbakir" finds "Diyarbakır" */
export function fold(s: string): string {
  return s
    .toLocaleLowerCase("tr")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // combining accents left over by NFD
    .replace(/ı/g, "i");
}
