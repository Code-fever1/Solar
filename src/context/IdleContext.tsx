import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { useSharedValue, type SharedValue } from "react-native-reanimated";

// ── Adaptive animation speed tiers ──
// animSpeedShared controls ONLY visual animation FPS on the UI thread.
// It is completely independent from isIdle (which controls data polling).
//
//   3 = full ~60fps (active interaction)
//   2 = ~30fps     (10s after last interaction)
//   1 = ~10fps     (40s after last interaction)
//   0 = stopped    (5min after last interaction)
//
// isIdle remains a boolean that flips true only at the 5-minute mark,
// preserving existing EnergyContext polling behavior.

const TIER_30FPS_MS = 10_000;     // 10s → drop to ~30fps
const TIER_10FPS_MS = 40_000;     // 40s → drop to ~10fps
const IDLE_TIMEOUT_MS = 300_000;  // 5min → stop animation + isIdle=true

type IdleContextValue = {
  isIdle: boolean;
  /** @deprecated Use animSpeedShared for animation control. Kept for backward compat. */
  isIdleShared: SharedValue<number>;
  /** 0-3 animation speed tier. 3=60fps, 2=30fps, 1=10fps, 0=stopped. */
  animSpeedShared: SharedValue<number>;
  resetIdleTimer: () => void;
};

const IdleContext = createContext<IdleContextValue | null>(null);

export function IdleProvider({ children }: { children: ReactNode }) {
  const [isIdle, setIsIdle] = useState(false);
  // isIdleShared kept for backward compat (1 = idle, 0 = active).
  // Updated alongside animSpeedShared so existing consumers don't break.
  const isIdleShared = useSharedValue(0);
  const animSpeedShared = useSharedValue(3);
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
    // Tier 2: ~30fps after 10s
    timer1Ref.current = setTimeout(() => {
      animSpeedShared.value = 2;
    }, TIER_30FPS_MS);
    // Tier 1: ~10fps after 40s
    timer2Ref.current = setTimeout(() => {
      animSpeedShared.value = 1;
    }, TIER_10FPS_MS);
    // Tier 0: stopped after 5min + isIdle = true for polling
    timer3Ref.current = setTimeout(() => {
      isIdleRef.current = true;
      setIsIdle(true);
      isIdleShared.value = 1;
      animSpeedShared.value = 0;
    }, IDLE_TIMEOUT_MS);
  };

  const resetIdleTimer = () => {
    if (isIdleRef.current) {
      isIdleRef.current = false;
      setIsIdle(false);
      isIdleShared.value = 0;
    }
    // Immediately restore full speed
    animSpeedShared.value = 3;
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
        animSpeedShared.value = 0;
      }
    });

    return () => {
      clearTimers();
      sub.remove();
    };
  }, []);

  return (
    <IdleContext.Provider value={{ isIdle, isIdleShared, animSpeedShared, resetIdleTimer }}>
      {children}
    </IdleContext.Provider>
  );
}

export function useIdle() {
  const ctx = useContext(IdleContext);
  if (!ctx) throw new Error("useIdle must be used within IdleProvider");
  return ctx;
}
