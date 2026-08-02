import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export function useTheme() {
  const scheme = useColorScheme();
  const theme = scheme === 'light' ? 'light' : 'dark';
  return Colors[theme];
}

export function useAppScheme() {
  const scheme = useColorScheme();
  const isLight = scheme === 'light';
  const isDark = !isLight;
  return { scheme: isLight ? 'light' : 'dark', isLight, isDark };
}
