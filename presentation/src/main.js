/**
 * Data May Cry presentation: reveal.js with speaker notes, climate stripes drawn from the
 * real world-mean temperature series, a live embed of the app and a QR code to it.
 *
 *   npm run dev            → http://localhost:5180
 *   ?app=http://localhost:5174   embed a local copy of the app instead of the live site
 *   S = speaker view (notes + timer) · F = full screen · O = overview · Esc = overview
 *
 * Written with AI assistance (Claude).
 */
import Reveal from "reveal.js";
import Notes from "reveal.js/plugin/notes/notes.esm.js";
import "reveal.js/dist/reveal.css";
import "@fontsource/outfit/400.css";
import "@fontsource/outfit/600.css";
import "@fontsource/outfit/700.css";
import "@fontsource/geist-sans/400.css";
import "@fontsource/geist-sans/500.css";
import QRCode from "qrcode";
import { LIVE_URL, WORLD_T2M } from "./data.js";
import "./style.css";

// ── colours: the app's trend palette (cool blue → near-white → warm red) ──
const COLD = [49, 99, 163];
const MID = [236, 233, 228];
const WARM = [192, 57, 43];
const mix = (a, b, t) => a.map((v, k) => Math.round(v + (b[k] - v) * t));
function color(x) {
  const t = Math.max(-1, Math.min(1, x));
  return `rgb(${(t < 0 ? mix(MID, COLD, -t) : mix(MID, WARM, t)).join(",")})`;
}

/** One stripe per year, coloured by the world mean difference from normal. */
function drawStripes(el) {
  const vals = WORLD_T2M.values;
  const scale = Math.max(...vals.map(Math.abs));
  el.innerHTML = "";
  const row = document.createElement("div");
  row.className = "stripes-row";
  vals.forEach((v, k) => {
    const s = document.createElement("span");
    s.style.background = color(v / scale);
    s.title = `${WORLD_T2M.start + k}: ${v > 0 ? "+" : ""}${v.toFixed(2).replace(".", ",")} °C`;
    row.appendChild(s);
  });
  el.appendChild(row);
  if (el.hasAttribute("data-labels")) {
    const labels = document.createElement("div");
    labels.className = "stripes-labels";
    const end = WORLD_T2M.start + vals.length - 1;
    for (const y of [WORLD_T2M.start, 1990, 2000, 2010, 2020, end]) {
      const l = document.createElement("span");
      l.textContent = String(y);
      l.style.left = `${((y - WORLD_T2M.start + 0.5) / vals.length) * 100}%`;
      labels.appendChild(l);
    }
    el.appendChild(labels);
  }
}
document.querySelectorAll("[data-stripes]").forEach(drawStripes);

// ── line icons (same 24×24 stroke style as the app) ──
const ICONS = {
  files: "M6 3h8l5 5v13H6z M14 3v5h5 M9 13h7 M9 17h7",
  units: "M3 17L17 3l4 4L7 21z M7 13l2 2 M10 10l2 2 M13 7l2 2",
  stats: "M4 20V11 M10 20V5 M16 20v-7 M3 20h18",
  student: "M2 9l10-5 10 5-10 5z M6 11v5c3 2 9 2 12 0v-5 M22 9v5",
  news: "M4 5h13v14H6a2 2 0 0 1-2-2z M17 9h3v8a2 2 0 0 1-2 2 M8 9h5 M8 13h5",
  city: "M3 21h18 M5 21V10 M19 21V10 M9 21v-6h6v6 M2 10l10-6 10 6",
  sprout: "M12 21v-9 M12 12c0-3.5-2.5-6-7-6 0 3.5 2.5 6 7 6z M12 14c0-3.5 2.5-6 7-6 0 3.5-2.5 6-7 6z M7 21h10",
};
document.querySelectorAll("[data-icon]").forEach((el) => {
  const d = ICONS[el.dataset.icon];
  if (d) el.innerHTML = `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
});

// ── the app: live site by default, ?app=… for a local copy (offline rehearsal) ──
const appUrl = new URLSearchParams(location.search).get("app") || LIVE_URL;
const demoUrl = `${appUrl}/#v=T2M&m=region&c=TUR&a=TR-21`;
document.querySelectorAll("[data-src-live]").forEach((f) => (f.dataset.src = demoUrl)); // reveal lazy-loads data-src
document.querySelectorAll("[data-live-label]").forEach((el) => (el.textContent = appUrl.replace(/^https?:\/\//, "")));
document.querySelectorAll("[data-live-link]").forEach((a) => {
  a.href = LIVE_URL;
  a.textContent = LIVE_URL.replace(/^https?:\/\//, "");
  a.target = "_blank";
  a.rel = "noopener";
});
document.querySelectorAll("[data-qr]").forEach((c) =>
  QRCode.toCanvas(c, LIVE_URL, { width: 220, margin: 1, color: { dark: "#0b0b0e", light: "#ffffff" } }),
);

// ── numbers count up when their slide or fragment appears ──
function countUp(el) {
  const to = Number(el.dataset.count);
  const dec = Number(el.dataset.decimals || 0);
  const sign = el.dataset.sign || "";
  const suffix = el.dataset.suffix || "";
  const fmt = (v) => sign + v.toLocaleString("tr-TR", { minimumFractionDigits: dec, maximumFractionDigits: dec }) + suffix;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return void (el.textContent = fmt(to));
  const t0 = performance.now();
  const step = (t) => {
    const p = Math.min(1, (t - t0) / 900);
    el.textContent = fmt(to * (1 - Math.pow(1 - p, 3)));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
const counted = new WeakSet();
function countIn(root) {
  root.querySelectorAll("[data-count]").forEach((el) => {
    const frag = el.closest(".fragment");
    if (counted.has(el) || (frag && !frag.classList.contains("visible"))) return;
    counted.add(el);
    countUp(el);
  });
}

const deck = new Reveal({
  hash: true,
  slideNumber: "c/t",
  controls: true,
  progress: true,
  center: true,
  transition: "fade",
  backgroundTransition: "fade",
  width: 1280,
  height: 720,
  margin: 0.06,
  plugins: [Notes],
});
deck.initialize().then(() => countIn(deck.getCurrentSlide()));
deck.on("slidechanged", (e) => countIn(e.currentSlide));
deck.on("fragmentshown", (e) => countIn(e.fragment.closest("section")));
