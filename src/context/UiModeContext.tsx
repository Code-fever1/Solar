import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type UiMode = "legacy" | "new";

type UiModeContextValue = {
  mode: UiMode;
  setMode: (mode: UiMode) => void;
  toggleMode: () => void;
  hydrated: boolean;
};

const UI_MODE_KEY = "voltix.ui-mode.v1";
const UiModeContext = createContext<UiModeContextValue | null>(null);

export function UiModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<UiMode>("legacy");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    void AsyncStorage.getItem(UI_MODE_KEY)
      .then((stored) => {
        if (stored === "legacy" || stored === "new") setModeState(stored);
      })
      .finally(() => setHydrated(true));
  }, []);

  const setMode = (nextMode: UiMode) => {
    setModeState(nextMode);
    void AsyncStorage.setItem(UI_MODE_KEY, nextMode);
  };

  return (
    <UiModeContext.Provider value={{ mode, setMode, toggleMode: () => setMode(mode === "legacy" ? "new" : "legacy"), hydrated }}>
      {children}
    </UiModeContext.Provider>
  );
}

export function useUiMode() {
  const context = useContext(UiModeContext);
  if (!context) throw new Error("useUiMode must be used within UiModeProvider");
  return context;
}
