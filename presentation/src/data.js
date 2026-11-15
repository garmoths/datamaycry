// Numbers used on the slides. All come from the project's own outputs; none are typed from
// memory. Sources: data/package (MERRA-2 package), docs/EVIDENCE.md (worker/report.py),
// the Diyarbakır card in the app, and the PR measurements.
// Written with AI assistance (Claude).

/** World mean 2 m air temperature difference from the 1991–2020 normal, per year
 *  (area-weighted mean of data/package/anomaly_frames/T2M.bin). */
export const WORLD_T2M = {
  start: 1980,
  values: [
    -0.141, -0.149, -0.436, -0.22, -0.398, -0.464, -0.375, -0.244, -0.148, -0.295, -0.099, -0.135, -0.371, -0.347,
    -0.285, -0.111, -0.265, -0.135, 0.073, -0.174, -0.167, 0.012, 0.122, 0.136, 0.038, 0.217, 0.063, 0.059, -0.076,
    0.005, 0.016, -0.091, -0.044, -0.043, 0.007, 0.148, 0.339, 0.25, 0.155, 0.315, 0.288, 0.172, 0.215, 0.548, 0.646,
    0.518,
  ],
};

export const LIVE_URL = "https://aeolusclimate.vercel.app";
