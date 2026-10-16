import { prefersReducedMotion, subscribeReduceMotion } from "@/lib/motion";
import { useEffect, useRef, useState } from "react";

export function useReducedMotionFlag() {
  const [reduced, setReduced] = useState(prefersReducedMotion());
  useEffect(() => subscribeReduceMotion(setReduced), []);
  return reduced;
}

/** Ease a live reading toward its latest value. Skips the ride when motion is reduced. */
export function useCountUp(target: number) {
  const reduced = useReducedMotionFlag();
  const [shown, setShown] = useState(target);
  const shownRef = useRef(target);

  useEffect(() => {
    const from = shownRef.current;
    if (reduced || !Number.isFinite(target) || !Number.isFinite(from) || Math.abs(target - from) < 0.4) {
      shownRef.current = target;
      setShown(target);
      return;
    }
    const start = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / 680);
      const eased = 1 - (1 - t) ** 3;
      const next = from + (target - from) * eased;
      shownRef.current = next;
      setShown(next);
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [reduced, target]);

  return shown;
}
