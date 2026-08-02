import { useEffect, useState } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';
import { addThemeListener, getThemeOverride, type ThemeMode } from './theme-state';

export function useColorScheme() {
  const rnScheme = useRNColorScheme();
  const [themeMode, setThemeMode] = useState<ThemeMode>(getThemeOverride());

  useEffect(() => {
    return addThemeListener((newTheme) => {
      setThemeMode(newTheme);
    });
  }, []);

  if (themeMode === 'system') {
    return rnScheme;
  }
  return themeMode;
}
