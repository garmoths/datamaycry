# Aeolus API

Free, no key, JSON, CORS open. The same calculation as the card on the site
(`web/src/apiCore.ts`, running as Vercel functions in `web/api/v1/`).

Base URL: `https://aeolusclimate.vercel.app/api/v1` (also opens from the site: ⓘ → API, or `/#api`).

| Endpoint | What |
|---|---|
| `GET /trend?place=TR-21&var=T2M&from=1980&to=2025&season=all` | a place's card: evidence, change per decade and total, 95 % range, p, Turkish/English text, yearly values |
| `GET /trend?lat=37.9&lon=40.2&var=PRECTOT` | the same for the nearest 0.5° × 0.625° grid cell |
| `GET /places?q=erzurum&limit=10` | find place ids (continents `EU`, countries `TUR`, provinces `TR-25`) |
| `GET /variables` | the nine variables, units, data period |
| `GET /series?place=TUR&var=PRECTOT` | monthly values since 1980-01 |

Parameters: `place` or `lat`+`lon`; `var` = T2M, QV2M, SPEED, PRECTOT, EVAP, GWETROOT, RUNOFF, SNOMAS,
TOTEXTTAU (default T2M); `from`/`to` whole years, at least 10 apart (default 1980–2025); `season` = all,
winter (Dec–Feb), spring, summer, autumn.

When the evidence is "none" (no clear change), `change_per_decade`, `change_total`, `ci95_per_decade` and
`meaning` are `null`: a non-significant slope has no reliable sign. Errors come back as
`{ "error": "…" }` with status 400 (bad request) or 404 (unknown place). Answers are cached for a day.

Local development: `cd web && npm run dev` serves the same endpoints at `http://localhost:5173/api/v1/…`
(on the mock data, or on the real package with `VITE_DATA_URL=/pkg/`).

Please credit "NASA MERRA-2 · Aeolus (Data May Cry)".
