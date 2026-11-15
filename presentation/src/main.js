/**
 * Aeolus presentation (team Data May Cry): reveal.js with speaker notes, climate stripes drawn from the
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
  // optional marker on one year (data-mark="1992"): a frame around that stripe and a short label above it
  const markYear = Number(el.dataset.mark);
  if (markYear) {
    const k = markYear - WORLD_T2M.start;
    row.children[k]?.classList.add("marked");
    const m = document.createElement("span");
    m.className = "stripes-mark";
    m.textContent = el.dataset.markText || String(markYear);
    m.style.left = `${((k + 0.5) / vals.length) * 100}%`;
    el.prepend(m);
  }
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
  snow: "M12 2.5v19 M3.8 7.25l16.4 9.5 M3.8 16.75l16.4-9.5 M9.5 4.5L12 7l2.5-2.5 M9.5 19.5L12 17l2.5 2.5",
  clock: "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18 M12 7v5l3 2",
  play: "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18 M10 8.5v7l6-3.5z",
  range: "M3 12h18 M7 8v8 M17 8v8 M3 5h4 M17 19h4",
  sum: "M17 5H7l6 7-6 7h10",
  rank: "M5 20v-6 M12 20V8 M19 20v-9 M3 20h18 M12 4l1.2 2.4 2.6.4-1.9 1.8.5 2.6L12 10l-2.4 1.2.5-2.6-1.9-1.8 2.6-.4z",
  finger: "M4 12a8 8 0 0 1 16 0 M7 15a5 5 0 0 1 10 0v1 M10 18a2 2 0 0 1 4 0v3 M12 12v9",
  pdf: "M6 3h8l5 5v13H6z M14 3v5h5 M9 13h1.5a1.5 1.5 0 0 1 0 3H9v-3 M9 16v2",
  energy: "M13 2L4 14h7l-1 8 9-12h-7z",
  map: "M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z M9 3v15 M15 6v15",
};
document.querySelectorAll("[data-icon]").forEach((el) => {
  const d = ICONS[el.dataset.icon];
  if (d) el.innerHTML = `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
});

// ── the app: live site by default, ?app=… for a local copy (offline rehearsal) ──
const appUrl = new URLSearchParams(location.search).get("app") || LIVE_URL;
const demoUrl = `${appUrl}/#v=T2M&m=region&c=TUR&a=TR-21`;
document.querySelectorAll("[data-src-live]").forEach((f) => (f.dataset.src = demoUrl)); // reveal lazy-loads data-src
// a live page cannot be printed: in the PDF the demo slide shows a screenshot of the app instead
if (/[?&]print-pdf\b/.test(location.search)) {
  document.querySelectorAll("iframe[data-src-live]").forEach((f) => {
    const img = document.createElement("img");
    img.src = f.dataset.shot || "/shots/diyarbakir.jpg";
    img.alt = "";
    img.className = "frame-shot";
    f.replaceWith(img);
  });
  document.querySelectorAll(".frame-note").forEach((n) => (n.innerHTML = n.innerHTML.replace(" · tıklanabilir", "")));
}
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
  if (document.documentElement.classList.contains("still") || matchMedia("(prefers-reduced-motion: reduce)").matches) return void (el.textContent = fmt(to));
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

// ── Aceternity-style "text generate": headlines settle word by word when their slide shows ──
// still mode: reduced motion, ?static (rehearsal screenshots) or ?print-pdf (PDF export)
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches || /[?&](static|print-pdf)\b/.test(location.search);
if (reduceMotion) document.documentElement.classList.add("still");
document.querySelectorAll("[data-generate]").forEach((el) => {
  let k = 0;
  const wrap = (node) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === Node.TEXT_NODE) {
        const frag = document.createDocumentFragment();
        for (const part of child.textContent.split(/(\s+)/)) {
          if (!part) continue;
          if (/^\s+$/.test(part)) frag.appendChild(document.createTextNode(part));
          else {
            const w = document.createElement("span");
            w.className = "gw";
            w.style.setProperty("--i", String(k++));
            w.textContent = part;
            frag.appendChild(w);
          }
        }
        child.replaceWith(frag);
      } else if (child.nodeType === Node.ELEMENT_NODE && child.tagName !== "BR") wrap(child);
    }
  };
  wrap(el);
});

// ── auto entrances: every .rise in a slide gets its place in the queue (--d), CSS does the rest ──
document.querySelectorAll(".reveal .slides > section").forEach((sec) => {
  sec.querySelectorAll(".rise").forEach((el, k) => el.style.setProperty("--d", String(k)));
});

// ── time travel: the app's year-by-year map, 46 frames in 10 s, played once; it stops on 2025 and a line appears ──
const TT = { y0: 1980, y1: 2025, ms: 10000, hold: 1400 };
let ttTimer = null;
const ttState = new WeakMap();
function buildTT(slide) {
  if (ttState.has(slide)) return ttState.get(slide);
  const box = slide.querySelector("[data-tt-frames]");
  const frames = [];
  for (let y = TT.y0; y <= TT.y1; y++) {
    const im = document.createElement("img");
    im.src = `/shots/tt/${y}.jpg?v=2`;
    im.alt = "";
    box.appendChild(im);
    frames.push(im);
  }
  const st = { frames, meta: {}, year: slide.querySelector("[data-tt-year]"), val: slide.querySelector("[data-tt-val]"), bar: slide.querySelector("[data-tt-bar]"), cap: slide.querySelector("[data-tt-cap]") };
  fetch("/shots/tt/meta.json?v=2").then((r) => r.json()).then((m) => (st.meta = m)).catch(() => {});
  st.show = (k) => {
    frames.forEach((f, j) => f.classList.toggle("on", j === k));
    const y = TT.y0 + k;
    st.year.textContent = String(y);
    const v = st.meta[y];
    st.val.textContent = v ? `${v.replace("-", "−")} °C` : "";
    st.val.classList.toggle("warm", !!v && v.startsWith("+"));
    st.bar.style.width = `${((k + 1) / frames.length) * 100}%`;
  };
  ttState.set(slide, st);
  return st;
}
function stopTT() {
  clearTimeout(ttTimer);
  ttTimer = null;
}
function startTT(slide) {
  stopTT();
  const st = buildTT(slide);
  const n = st.frames.length;
  if (reduceMotion) return void st.show(n - 1);
  st.cap.classList.remove("show");
  let k = 0;
  const tick = () => {
    st.show(k);
    if (k === n - 1) return void st.cap.classList.add("show"); // one pass only: stop on 2025, the line below comes in
    k += 1;
    ttTimer = setTimeout(tick, TT.ms / n);
  };
  tick();
}
function ttFor(slide) {
  if (slide?.hasAttribute("data-tt")) startTT(slide);
  else stopTT();
}
// photo wall: two copies of each row so the loop is seamless
document.querySelectorAll(".wall-track").forEach((t) => (t.innerHTML += t.innerHTML));

// ── marquee: two copies of each row so the loop is seamless ──
document.querySelectorAll(".marquee-track").forEach((t) => {
  t.innerHTML += t.innerHTML.replace(/class="q"/g, 'class="q" aria-hidden="true"');
});

// ── Amicro-style light under the pointer on glass cards ──
document.addEventListener("pointermove", (e) => {
  const el = e.target.closest?.(".glow");
  if (!el) return;
  const r = el.getBoundingClientRect();
  el.style.setProperty("--mx", `${((e.clientX - r.left) / r.width) * 100}%`);
  el.style.setProperty("--my", `${((e.clientY - r.top) / r.height) * 100}%`);
});

// ── Aceternity-style 3D card: tilts gently towards the pointer ──
document.querySelectorAll(".tilt").forEach((el) => {
  if (reduceMotion) return;
  el.addEventListener("pointermove", (e) => {
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty("--rx", `${(-y * 8).toFixed(2)}deg`);
    el.style.setProperty("--ry", `${(x * 10).toFixed(2)}deg`);
  });
  el.addEventListener("pointerleave", () => {
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
  });
});

const deck = new Reveal({
  hash: true,
  // the NASA deck prints its own page footer
  slideNumber: document.body.classList.contains("nasa") ? false : "c/t",
  controls: true,
  progress: true,
  center: true,
  transition: "fade",
  backgroundTransition: "fade",
  width: 1280,
  height: 720,
  margin: 0.06,
  // PDF: one page per slide, with every step shown
  pdfSeparateFragments: false,
  plugins: [Notes],
});
// replay the word-by-word headline each time a slide is shown
function generate(slide) {
  if (reduceMotion || !slide) return;
  slide.querySelectorAll("[data-generate]").forEach((el) => {
    el.classList.remove("go");
    void el.offsetWidth; // restart the animation
    el.classList.add("go");
  });
}
deck.initialize().then(() => {
  countIn(deck.getCurrentSlide());
  generate(deck.getCurrentSlide());
  ttFor(deck.getCurrentSlide());
});
deck.on("slidechanged", (e) => {
  countIn(e.currentSlide);
  generate(e.currentSlide);
  ttFor(e.currentSlide);
});
deck.on("fragmentshown", (e) => countIn(e.fragment.closest("section")));
