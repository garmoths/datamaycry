/**
 * Screenshots of the app and PDF exports of the presentation, driven by an installed
 * Chromium browser (Chrome, Brave or Edge) through puppeteer-core — no browser download.
 *
 *   npm run shots   app screenshots → public/shots/*.jpg   (needs the app on APP_URL, default http://localhost:5174;
 *                   ONLY=world,answer re-takes just those)
 *   npm run pdf     PDFs → pdf/aeolus-sunum.pdf (11 slides, Turkish) and pdf/aeolus-nasa.pdf (7 pages, English)
 *                   (needs `npm run dev` running on http://localhost:5180)
 *
 * Written with AI assistance (Claude).
 */
import { existsSync, mkdirSync } from "node:fs";
import puppeteer from "puppeteer-core";

const BROWSERS = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean);
const executablePath = BROWSERS.find((p) => existsSync(p));
if (!executablePath) throw new Error("No Chrome/Brave/Edge found. Set CHROME_PATH.");

const APP = process.env.APP_URL || "http://localhost:5174";
const DECK = process.env.DECK_URL || "http://localhost:5180";
const what = process.argv[2] || "pdf";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--hide-scrollbars"],
});
try {
  if (what === "shots") {
    mkdirSync("public/shots", { recursive: true });
    // `click`: buttons pressed in order (matched by aria-label or text start), each followed by `pause` ms
    const DIY = "#v=T2M&m=region&c=TUR&a=TR-21";
    const shots = [
      { file: "world", hash: "#v=T2M&m=region", lang: "en" },
      { file: "answer", hash: DIY, lang: "en", click: ["01"] },
      // time travel jumps to 2024 by setting the range's first year (playing through is slow headless)
      { file: "timetravel", hash: "#v=T2M&m=region", lang: "en", click: ["Time travel"], pause: 5000, select: 2024 },
      { file: "timetravel_1992", hash: "#v=T2M&m=region", lang: "en", click: ["Time travel"], pause: 5000, select: 1992 },
      { file: "diyarbakir_tr", hash: DIY, lang: "tr", click: ["01"] },
    ];
    const only = process.env.ONLY?.split(",");
    for (const s of shots.filter((x) => !only || only.includes(x.file))) {
      const page = await browser.newPage();
      await page.evaluateOnNewDocument((l) => localStorage.setItem("dmc-lang", l), s.lang);
      await page.setViewport({ width: 1440, height: 860, deviceScaleFactor: 2 });
      await page.goto(`${APP}/${s.hash}`, { waitUntil: "networkidle2", timeout: 60000 });
      await wait(9000); // globe tiles and the card's entrance animation
      for (const label of s.click ?? []) {
        const ok = await page.evaluate((t) => {
          const el = [...document.querySelectorAll("button")].find((b) => (b.getAttribute("aria-label") || b.textContent || "").trim().startsWith(t));
          el?.click();
          return !!el;
        }, label);
        if (!ok) throw new Error(`${s.file}: no button "${label}"`);
        await wait(s.pause ?? 3500);
      }
      if (s.select) {
        const ok = await page.evaluate((y) => {
          const sel = document.querySelector("select");
          if (!sel) return false;
          // React tracks the value: go through the native setter so the change event is seen
          Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(sel, String(y));
          sel.dispatchEvent(new Event("change", { bubbles: true }));
          return true;
        }, s.select);
        if (!ok) throw new Error(`${s.file}: no year select`);
        await wait(8000);
      }
      await page.screenshot({ path: `public/shots/${s.file}.jpg`, type: "jpeg", quality: 86 });
      console.log(`→ public/shots/${s.file}.jpg`);
      await page.close();
    }
  } else {
    mkdirSync("pdf", { recursive: true });
    const decks = [
      { file: "aeolus-sunum.pdf", url: `${DECK}/?print-pdf&static` },
      { file: "aeolus-nasa.pdf", url: `${DECK}/nasa.html?print-pdf&static` },
    ];
    for (const d of decks) {
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 720 });
      await page.goto(d.url, { waitUntil: "networkidle0", timeout: 60000 });
      await page.evaluate(() => document.fonts.ready);
      await wait(2500);
      await page.pdf({ path: `pdf/${d.file}`, width: "1280px", height: "720px", printBackground: true, preferCSSPageSize: false });
      console.log(`→ pdf/${d.file}`);
      await page.close();
    }
  }
} finally {
  await browser.close();
}
