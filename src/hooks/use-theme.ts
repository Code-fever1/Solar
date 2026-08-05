import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/use-color-scheme";

export type Theme = (typeof Colors.light | typeof Colors.dark);
export type ThemeKey = keyof (typeof Colors.light) & keyof (typeof Colors.dark);

// useTheme returns the theme object directly (e.g. theme.text, theme.card).
// isLight is included as a property for components that need to know the scheme.
export function useTheme(): Theme & { isLight: boolean } {
  const scheme = useColorScheme();
  const isLight = scheme === "light";
  const theme = isLight ? Colors.light : Colors.dark;
  return { ...theme, isLight };
}
