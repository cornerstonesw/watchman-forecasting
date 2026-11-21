// Watchman theme: the ONE place colors and shadows are defined, for the light
// theme AND the dark theme (same approach as LIFESuite).
//
// Components only use names — `bg-panel`, `text-ink`, `border-line`,
// `text-up` — and the browser swaps the values when the theme changes.
// themeCss() turns both palettes into CSS variables (--c-panel: 255 255 255),
// app/layout.tsx puts them on the page, tailwind.config.ts maps each class to
// its variable. Code that needs a value inline (charts) uses colorVar("navy").
//
// Brand (from the original build spec): navy #163A5F, teal #397F7A, amber #D69A2D.

type Palette = Record<string, string>;

const light: Palette = {
  // surfaces
  page: "#F3F6F9",
  panel: "#FFFFFF",
  "panel-2": "#F7F9FB",       // card headers, grid header row, zebra rows
  sunken: "#EDF1F5",          // segmented-control track, input wells
  chrome: "#0E2742",          // sidebar + hero band (dark in both themes)
  "chrome-2": "#163A5F",
  "chrome-line": "#24496F",
  scrim: "#0B1A2B",

  // text
  ink: "#16212E",
  slate: "#4B5869",
  muted: "#7A8797",
  "on-chrome": "#E7EEF6",
  "on-chrome-dim": "#9DB2C8",

  // lines
  line: "#DDE4EB",
  "line-strong": "#C5CFDA",

  // brand
  navy: "#163A5F",
  teal: "#397F7A",
  "teal-soft": "#E3F0EE",
  amber: "#D69A2D",
  "amber-soft": "#FBF1DE",
  "amber-ink": "#8A5D12",

  // movement — chosen to read for red/green colour-blind users (blue vs orange)
  up: "#1F7A5A",
  "up-soft": "#E2F3EC",
  down: "#C2410C",
  "down-soft": "#FCE9DF",
  flat: "#7A8797",
  "flat-soft": "#EEF1F4",
  shift: "#6D5BD0",
  "shift-soft": "#ECE8FB",
  new: "#1D6FB8",
  "new-soft": "#E2EEF9",
  removed: "#9F3A50",
  "removed-soft": "#F7E5E9",

  // chart series
  "series-prev": "#A9B7C6",
  "series-curr": "#163A5F",
  focus: "#D69A2D",
};

const dark: Palette = {
  page: "#0B1520",
  panel: "#111E2C",
  "panel-2": "#152435",
  sunken: "#0E1A27",
  chrome: "#08131F",
  "chrome-2": "#0F2236",
  "chrome-line": "#1B3550",
  scrim: "#000000",

  ink: "#E6EDF5",
  slate: "#B3C1D1",
  muted: "#7F91A5",
  "on-chrome": "#E7EEF6",
  "on-chrome-dim": "#8FA6BE",

  line: "#213347",
  "line-strong": "#2E4560",

  navy: "#7FB0E0",
  teal: "#5BB8AE",
  "teal-soft": "#13302E",
  amber: "#E6B04F",
  "amber-soft": "#3A2C12",
  "amber-ink": "#F1C77A",

  up: "#4CC495",
  "up-soft": "#123227",
  down: "#F08A55",
  "down-soft": "#3A1F12",
  flat: "#8E9EB0",
  "flat-soft": "#1A2838",
  shift: "#A99CF2",
  "shift-soft": "#25204A",
  new: "#6DB2F0",
  "new-soft": "#12283F",
  removed: "#E27D95",
  "removed-soft": "#3A1621",

  "series-prev": "#4A5E74",
  "series-curr": "#7FB0E0",
  focus: "#E6B04F",
};

const shadows = {
  card: "0 1px 2px rgb(var(--c-scrim) / 0.06), 0 1px 1px rgb(var(--c-scrim) / 0.04)",
  lift: "0 10px 30px -12px rgb(var(--c-scrim) / 0.28), 0 2px 6px rgb(var(--c-scrim) / 0.08)",
  glow: "0 0 0 1px rgb(var(--c-amber) / 0.55), 0 8px 28px -8px rgb(var(--c-amber) / 0.55)",
  pop: "0 24px 60px -20px rgb(var(--c-scrim) / 0.45)",
};

const rgb = (hex: string) => {
  const h = hex.replace("#", "");
  return `${parseInt(h.slice(0, 2), 16)} ${parseInt(h.slice(2, 4), 16)} ${parseInt(h.slice(4, 6), 16)}`;
};

const vars = (p: Palette) =>
  Object.entries(p)
    .map(([k, v]) => `--c-${k}: ${rgb(v)};`)
    .join(" ");

export function themeCss(): string {
  return [
    `:root { ${vars(light)} color-scheme: light; }`,
    `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { ${vars(dark)} color-scheme: dark; } }`,
    `:root[data-theme="dark"] { ${vars(dark)} color-scheme: dark; }`,
  ].join("\n");
}

export function tailwindColors(): Record<string, string> {
  return Object.fromEntries(Object.keys(light).map((k) => [k, `rgb(var(--c-${k}) / <alpha-value>)`]));
}

export const tailwindShadows = () => shadows;

/** For inline styles / SVG / charts: colorVar("navy") or colorVar("navy", 0.3) */
export function colorVar(name: keyof typeof light, alpha = 1): string {
  return alpha === 1 ? `rgb(var(--c-${name}))` : `rgb(var(--c-${name}) / ${alpha})`;
}

export type ColorName = keyof typeof light;
