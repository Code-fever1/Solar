export type ThemeMode = 'light' | 'dark' | 'system';
let currentTheme: ThemeMode = 'system';
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
