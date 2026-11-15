# Aeolus · Presentation

*Team Data May Cry*

A presentation written in code with reveal.js. Works offline too (fonts and libraries are local).

```bash
cd presentation
npm install
npm run dev        # http://localhost:5180
```

| Key | What it does |
|---|---|
| → / Space | next step |
| ← | previous step |
| **S** | speaker view (notes + timer) |
| F | full screen |
| O or Esc | all slides |

- Flow (~2:30 + 30 s spare, 8 slides): opening → questions → **live demo (slide 3)** → who uses it and why →
  results → pros and cons → time travel (46 years in 10 s, plays once) → QR code.
- Cards come in on their own, in order (`.rise`); there are no key-triggered steps.
- The blurred screens behind the time travel slide are `public/shots/z-*.jpg`, taken from the live site for Diyarbakır.
- The time travel frames on slide 7 are `public/shots/tt/1980…2025.jpg` (+ `meta.json`), captured year by year from the app's Time travel.
- Effects (Aceternity / Amicro style, plain CSS/JS): aurora background, headlines arriving word by word,
  scrolling question cards, bento grid, 3D tilting card, a light that follows the cursor, a frame spinning around the QR.
- No-animation view: `?static` (for screenshots during rehearsal). Also off in the PDF and with the "reduce motion" setting.
- Slide 3 embeds the live app (`aeolusclimate.vercel.app`). Without internet, a local copy: `http://localhost:5180/?app=http://localhost:5174`.
- Numbers come from `src/data.js` and `docs/EVIDENCE.md`; no made-up numbers.
- To get a PDF: `http://localhost:5180/?print-pdf` → Print in the browser → Save as PDF.

## Two versions and the PDFs

| File | What | Pages |
|---|---|---|
| `index.html` | Turkish live presentation (including the live demo slide) | 8 |
| `nasa.html` | English version to upload to NASA: same order as the talk, a caption under every image, a link and page number on every page | 7 |
| `pdf/aeolus-nasa.pdf` | PDF to upload to NASA | 7 |
| `ANLATIM.md` | Speaker script (slide by slide, ~2:30) and likely questions | – |
| `pdf/aeolus-sunum.pdf` | PDF of the Turkish presentation (backup; a screenshot instead of the live demo) | 11 |

To regenerate the PDFs (Chrome/Brave/Edge must be installed):

```bash
npm run dev          # in one terminal, http://localhost:5180
npm run shots        # app screenshots (the app must be running at http://localhost:5174)
npm run pdf          # pdf/aeolus-sunum.pdf and pdf/aeolus-nasa.pdf
```
