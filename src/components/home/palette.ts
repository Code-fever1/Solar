/** Shared source colours. Tesla screen uses inkFor() so light scenes stay light. */
export const SOURCE = {
  solar: "#F5B83D",
  home: "#4C8DFF",
  grid: "#8E8E93",
  export: "#30D158",
} as const;

export type Ink = {
  bg: string;
  card: string;
  text: string;
  secondary: string;
  highlight: string;
  border: string;
  frost: string;
  good: string;
  warn: string;
  bad: string;
};

export const INK: Ink = {
  bg: "#000000",
  card: "#1C1C1E",
  text: "#F5F5F7",
  secondary: "#98989D",
  highlight: "rgba(255,255,255,0.08)",
  border: "rgba(255,255,255,0.10)",
  frost: "rgba(0,0,0,0.72)",
  good: "#30D158",
  warn: "#F5B83D",
  bad: "#FF6961",
};

const PAPER: Ink = {
  bg: "#F5F5F7",
  card: "#FFFFFF",
  text: "#1D1D1F",
  secondary: "#6E6E73",
  highlight: "rgba(0,0,0,0.04)",
  border: "rgba(0,0,0,0.08)",
  frost: "rgba(255,255,255,0.82)",
  good: "#248A3D",
  warn: "#B8860B",
  bad: "#D70015",
};

export function inkFor(isLight: boolean): Ink {
  return isLight ? PAPER : INK;
}
