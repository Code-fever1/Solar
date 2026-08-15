function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function hexToRgb(hex: string): [number, number, number] {
  const cleanHex = hex.replace('#', '');
  if (cleanHex.length !== 6) return [255, 255, 255];
  const r = parseInt(cleanHex.slice(0, 2), 16);
  const g = parseInt(cleanHex.slice(2, 4), 16);
  const b = parseInt(cleanHex.slice(4, 6), 16);
  return [r, g, b];
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
