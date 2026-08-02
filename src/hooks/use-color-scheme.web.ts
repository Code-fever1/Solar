import { useEffect, useState } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';
import { addThemeListener, getThemeOverride, type ThemeMode } from './theme-state';

export function useColorScheme() {
  const [hasHydrated, setHasHydrated] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>(getThemeOverride());

  useEffect(() => {
    setHasHydrated(true);
    return addThemeListener((newTheme) => {
      setThemeMode(newTheme);
    });
  }, []);

  const rnScheme = useRNColorScheme();

  if (!hasHydrated) {
    return 'light';
  }

  if (themeMode === 'system') {
    return rnScheme;
  }
  return themeMode;
}
