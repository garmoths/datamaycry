/**
 * Line icons (24×24, stroke = currentColor) so every symbol shares one style instead of
 * platform emoji that render differently on Windows/macOS/Android. Drawn for this project.
 * Written with AI assistance (Claude).
 */
import type { SVGProps } from "react";

export type IconName =
  | "globe" | "grid" | "info" | "chevron" | "language"
  | "thermometer" | "droplet" | "wind" | "rain" | "evaporation" | "runoff"
  | "sprout" | "snow" | "haze" | "sun" | "drought" | "flame" | "kite" | "search" | "link";

const PATHS: Record<IconName, string> = {
  globe: "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18 M3 12h18 M12 3c2.6 2.6 3.8 5.6 3.8 9s-1.2 6.4-3.8 9 M12 3c-2.6 2.6-3.8 5.6-3.8 9s1.2 6.4 3.8 9",
  grid: "M4 4h16v16H4z M4 9.33h16 M4 14.67h16 M9.33 4v16 M14.67 4v16",
  info: "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18 M12 11v5 M12 7.5v.5",
  chevron: "M6 9l6 6 6-6",
  language: "M4 5h9 M8.5 3v2 M6 5c.8 3 2.8 5.3 5.5 6.5 M11 5c-.8 3-2.8 5.3-5.5 6.5 M13 21l4-9 4 9 M14.3 18h5.4",
  thermometer: "M14 14.5V5a2 2 0 1 0-4 0v9.5a4 4 0 1 0 4 0z M12 9v7",
  droplet: "M12 3.5c3.5 4.3 6 7.6 6 10.6a6 6 0 0 1-12 0c0-3 2.5-6.3 6-10.6z",
  wind: "M3 8h11a3 3 0 1 0-3-3 M3 12h16a3 3 0 1 1-3 3 M3 16h7",
  rain: "M7 15a4 4 0 0 1-.6-8A5.5 5.5 0 0 1 17 7.5a3.8 3.8 0 0 1 0 7.5z M8 18l-1 2.5 M12 18l-1 2.5 M16 18l-1 2.5",
  evaporation: "M7 13a4 4 0 0 1-.6-8A5.5 5.5 0 0 1 17 5.5a3.8 3.8 0 0 1 0 7.5z M12 21v-6 M9.5 17.5L12 15l2.5 2.5",
  runoff: "M3 9c2 0 2-1.5 4.5-1.5S9.5 9 12 9s2-1.5 4.5-1.5S18.5 9 21 9 M3 14c2 0 2-1.5 4.5-1.5S9.5 14 12 14s2-1.5 4.5-1.5S18.5 14 21 14 M3 19c2 0 2-1.5 4.5-1.5S9.5 19 12 19s2-1.5 4.5-1.5S18.5 19 21 19",
  sprout: "M12 21v-9 M12 12c0-3.5-2.5-6-7-6 0 3.5 2.5 6 7 6z M12 14c0-3.5 2.5-6 7-6 0 3.5-2.5 6-7 6z M7 21h10",
  snow: "M12 2.5v19 M3.8 7.25l16.4 9.5 M3.8 16.75l16.4-9.5 M9.5 4.5L12 7l2.5-2.5 M9.5 19.5L12 17l2.5 2.5",
  haze: "M4 8h16 M2 12h20 M4 16h16 M7 20h10 M7 4h10",
  sun: "M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8 M12 2v2 M12 20v2 M4.9 4.9l1.4 1.4 M17.7 17.7l1.4 1.4 M2 12h2 M20 12h2 M4.9 19.1l1.4-1.4 M17.7 6.3l1.4-1.4",
  drought: "M3 20h18 M6 20l2-5 3 2 2-4 3 3 2-6 M15 4a3 3 0 1 0 0 .01",
  flame: "M12 21a6 6 0 0 0 6-6c0-4-3-6-4-10-1.5 2-2 3.5-2 5-1-1-2-2-2.5-3.5C7.5 9 6 11.5 6 15a6 6 0 0 0 6 6z",
  kite: "M12 2l6 7-6 9-6-9z M12 18c0 2-2 2-2 4 M6 9h12",
  search: "M11 4a7 7 0 1 0 0 14a7 7 0 1 0 0-14 M20 20l-4-4",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1 M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
};

export function Icon({ name, size = 20, ...rest }: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

/**
 * Logo: a globe whose outline is cut by a rising trend line with its data points —
 * "a trend detective for Earth". Two-tone so it reads on the dark UI.
 */
export function Logo({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" role="img" aria-label="Data May Cry">
      <defs>
        <linearGradient id="logo-g" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#2166ac" />
          <stop offset="1" stopColor="#5fb0e8" />
        </linearGradient>
        <linearGradient id="logo-t" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#f4a582" />
          <stop offset="1" stopColor="#ffd166" />
        </linearGradient>
      </defs>
      <circle cx="20" cy="20" r="15" fill="url(#logo-g)" />
      <g fill="none" stroke="#dbe9ff" strokeOpacity="0.55" strokeWidth="1.2">
        <ellipse cx="20" cy="20" rx="6.5" ry="15" />
        <path d="M5 20h30 M7.5 12.5h25 M7.5 27.5h25" />
      </g>
      <polyline points="4,30 13,24 20,26 29,15 37,10" fill="none" stroke="#0a1328" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="4,30 13,24 20,26 29,15 37,10" fill="none" stroke="url(#logo-t)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      {[[13, 24], [20, 26], [29, 15]].map(([x, y]) => (
        <circle key={x} cx={x} cy={y} r="2" fill="#ffd166" stroke="#0a1328" strokeWidth="1.2" />
      ))}
    </svg>
  );
}
