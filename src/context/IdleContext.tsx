import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { useSharedValue, type SharedValue } from "react-native-reanimated";

// ── Animation FPS Controller ──
//
// animationFpsShared controls ONLY the decorative animation frame rate on the
// UI thread. It is completely independent from isIdle (which controls data
// polling / SSE).
//
// Target FPS lifecycle:
//   120  — active interaction (first 10s)
//   60   — 10s after last interaction
//   30   — 40s after last interaction
//   10   — 5min after last interaction (animation continues slowly)
//   0    — app backgrounded or Home tab not focused
//
// isIdle remains a boolean that flips true only at the 5-minute mark,
// preserving existing EnergyContext polling behavior.

const FPS_ACTIVE_MS = 10_000;       // 10s at 120 FPS
const FPS_60_MS = 40_000;           // 40s → drop to 60 FPS
const FPS_30_MS = 300_000;          // 5min → drop to 30 FPS then 10 FPS
const IDLE_TIMEOUT_MS = 300_000;    // 5min → isIdle = true (polling behavior)

export type AnimationFPS = 120 | 60 | 30 | 10 | 0;

type IdleContextValue = {
  isIdle: boolean;
  /** 1 = idle, 0 = active. Kept for backward compat with any worklet consumers. */
  isIdleShared: SharedValue<number>;
  /** Explicit animation target FPS: 120, 60, 30, 10, or 0 (stopped). */
  animationFpsShared: SharedValue<number>;
  resetIdleTimer: () => void;
};

const IdleContext = createContext<IdleContextValue | null>(null);

export function IdleProvider({ children }: { children: ReactNode }) {
  const [isIdle, setIsIdle] = useState(false);
  const isIdleShared = useSharedValue(0);
  const animationFpsShared = useSharedValue<number>(120);
  const timer1Ref = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timer2Ref = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timer3Ref = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isIdleRef = useRef(false);

  const clearTimers = () => {
    if (timer1Ref.current) { clearTimeout(timer1Ref.current); timer1Ref.current = null; }
    if (timer2Ref.current) { clearTimeout(timer2Ref.current); timer2Ref.current = null; }
    if (timer3Ref.current) { clearTimeout(timer3Ref.current); timer3Ref.current = null; }
  };

  const startTimerChain = () => {
    clearTimers();
    // 10s → 60 FPS
    timer1Ref.current = setTimeout(() => {
      animationFpsShared.value = 60;
    }, FPS_ACTIVE_MS);
    // 40s → 30 FPS
    timer2Ref.current = setTimeout(() => {
      animationFpsShared.value = 30;
    }, FPS_60_MS);
    // 5min → 10 FPS + isIdle = true for polling
    timer3Ref.current = setTimeout(() => {
      animationFpsShared.value = 10;
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
    // Immediately restore full 120 FPS
    animationFpsShared.value = 120;
    startTimerChain();
  };

  useEffect(() => {
    startTimerChain();

    const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state === "active") {
        resetIdleTimer();
      } else if (state === "background") {
        // Only treat true background as idle. "inactive" fires for the
        // notification shade / overlay permission sheet and would freeze
        // dashboard polling while the app is still visible.
        clearTimers();
        if (!isIdleRef.current) {
          isIdleRef.current = true;
          setIsIdle(true);
          isIdleShared.value = 1;
        }
        // Stop animation immediately on background
        animationFpsShared.value = 0;
      }
    });

    return () => {
      clearTimers();
      sub.remove();
    };
  }, []);

  return (
    <IdleContext.Provider value={{ isIdle, isIdleShared, animationFpsShared, resetIdleTimer }}>
      {children}
    </IdleContext.Provider>
  );
}

export function useIdle() {
  const ctx = useContext(IdleContext);
  if (!ctx) throw new Error("useIdle must be used within IdleProvider");
  return ctx;
}
