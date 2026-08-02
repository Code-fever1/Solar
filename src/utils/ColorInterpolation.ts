export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (c: number) => Math.round(clamp(c, 0, 255)).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

export function hexToRgb(hex: string): [number, number, number] {
  const cleanHex = hex.replace('#', '');
  if (cleanHex.length !== 6) return [255, 255, 255];
  const r = parseInt(cleanHex.slice(0, 2), 16);
  const g = parseInt(cleanHex.slice(2, 4), 16);
  const b = parseInt(cleanHex.slice(4, 6), 16);
  return [r, g, b];
}

export function interpolateRgb(c1: [number, number, number], c2: [number, number, number], t: number): string {
  const r = c1[0] + (c2[0] - c1[0]) * t;
  const g = c1[1] + (c2[1] - c1[1]) * t;
  const b = c1[2] + (c2[2] - c1[2]) * t;
  return rgbToHex(r, g, b);
}

export function withAlpha(colorString: string, alpha: number): string {
  if (colorString.startsWith('rgba(') || colorString.startsWith('rgb(')) {
    const numbers = colorString.match(/\d+(?:\.\d+)?/g);
    if (numbers && numbers.length >= 3) {
      return `rgba(${numbers[0]}, ${numbers[1]}, ${numbers[2]}, ${alpha})`;
    }
  }
  const [r, g, b] = hexToRgb(colorString);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Shared Color Stops (0 to 100 percentage)
const COLOR_STOPS: Array<{ score: number; rgb: [number, number, number] }> = [
  { score: 0, rgb: hexToRgb('#991B1B') },
  { score: 5, rgb: hexToRgb('#991B1B') },
  { score: 10, rgb: hexToRgb('#EF4444') },
  { score: 15, rgb: hexToRgb('#F97316') },
  { score: 20, rgb: hexToRgb('#FB923C') },
  { score: 25, rgb: hexToRgb('#FDBA74') },
  { score: 30, rgb: hexToRgb('#FACC15') },
  { score: 35, rgb: hexToRgb('#FEF3C7') },
  { score: 45, rgb: hexToRgb('#FFFBEA') },
  { score: 50, rgb: hexToRgb('#FFFFFF') },
  { score: 55, rgb: hexToRgb('#E8FFF0') },
  { score: 60, rgb: hexToRgb('#B2F2C0') },
  { score: 65, rgb: hexToRgb('#83E49A') },
  { score: 75, rgb: hexToRgb('#5ED67E') },
  { score: 80, rgb: hexToRgb('#43C76E') },
  { score: 85, rgb: hexToRgb('#2AB85F') },
  { score: 90, rgb: hexToRgb('#169E46') },
  { score: 95, rgb: hexToRgb('#119640') },
  { score: 100, rgb: hexToRgb('#0B8F3A') },
];

export function getHealthColor(score: number): string {
  const clamped = clamp(score, 0, 100);
  if (clamped <= COLOR_STOPS[0].score) return rgbToHex(...COLOR_STOPS[0].rgb);
  if (clamped >= COLOR_STOPS[COLOR_STOPS.length - 1].score) {
    return rgbToHex(...COLOR_STOPS[COLOR_STOPS.length - 1].rgb);
  }

  for (let i = 0; i < COLOR_STOPS.length - 1; i++) {
    const s1 = COLOR_STOPS[i];
    const s2 = COLOR_STOPS[i + 1];
    if (clamped >= s1.score && clamped <= s2.score) {
      const span = s2.score - s1.score;
      const t = span === 0 ? 0 : (clamped - s1.score) / span;
      return interpolateRgb(s1.rgb, s2.rgb, t);
    }
  }
  return rgbToHex(...COLOR_STOPS[COLOR_STOPS.length - 1].rgb);
}

export function getRemainingUnitsColorSmooth(remainingUnits: number, targetUnits: number = 200): string {
  const percentage = clamp((remainingUnits / (targetUnits > 0 ? targetUnits : 200)) * 100, 0, 100);
  return getHealthColor(percentage);
}

export function getRingThickness(healthScore: number): number {
  const score = clamp(healthScore, 0, 100);
  if (score >= 75) return 8;  // Healthy
  if (score >= 50) return 9;  // Medium
  if (score >= 25) return 10; // Poor
  return 11;                  // Critical
}

export function getRingGlowColor(healthScore: number, alpha = 0.35): string {
  const hexColor = getHealthColor(healthScore);
  return withAlpha(hexColor, alpha);
}
