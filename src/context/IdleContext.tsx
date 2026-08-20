import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { useSharedValue, type SharedValue } from "react-native-reanimated";

const IDLE_TIMEOUT_MS = 300_000; // 5 minutes — hero animation runs for 5 min before idle pause

type IdleContextValue = {
  isIdle: boolean;
  isIdleShared: SharedValue<number>;
  resetIdleTimer: () => void;
};

const IdleContext = createContext<IdleContextValue | null>(null);

export function IdleProvider({ children }: { children: ReactNode }) {
  const [isIdle, setIsIdle] = useState(false);
  const isIdleShared = useSharedValue(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isIdleRef = useRef(false);

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const startTimer = () => {
    clearTimer();
    timerRef.current = setTimeout(() => {
      isIdleRef.current = true;
      setIsIdle(true);
      isIdleShared.value = 1;
    }, IDLE_TIMEOUT_MS);
  };

  const resetIdleTimer = () => {
    if (isIdleRef.current) {
      isIdleRef.current = false;
      setIsIdle(false);
      isIdleShared.value = 0;
    }
    startTimer();
  };

  useEffect(() => {
    startTimer();

    const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state === "active") {
        resetIdleTimer();
      } else if (state === "background") {
        // Only treat true background as idle. "inactive" fires for the
        // notification shade / overlay permission sheet and would freeze
        // dashboard polling while the app is still visible.
        clearTimer();
        if (!isIdleRef.current) {
          isIdleRef.current = true;
          setIsIdle(true);
          isIdleShared.value = 1;
        }
      }
    });

    return () => {
      clearTimer();
      sub.remove();
    };
  }, []);

  return (
    <IdleContext.Provider value={{ isIdle, isIdleShared, resetIdleTimer }}>
      {children}
    </IdleContext.Provider>
  );
}

export function useIdle() {
  const ctx = useContext(IdleContext);
  if (!ctx) throw new Error("useIdle must be used within IdleProvider");
  return ctx;
}
