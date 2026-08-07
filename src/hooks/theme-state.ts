export type ThemeMode = 'light' | 'dark' | 'system';
// Default to 'dark' — the app has its own scene-driven theming on the home
// page and a consistent dark aesthetic on all screens. The phone's system
// dark/light setting must NOT impact the app's appearance.
let currentTheme: ThemeMode = 'dark';
const listeners = new Set<(theme: ThemeMode) => void>();

export function getThemeOverride(): ThemeMode {
  return currentTheme;
}

export function setThemeOverride(theme: ThemeMode) {
  currentTheme = theme;
  listeners.forEach((l) => l(theme));
}

export function addThemeListener(listener: (theme: ThemeMode) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
