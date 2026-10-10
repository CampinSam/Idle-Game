import { useState, useEffect, useRef, type CSSProperties } from 'react';

/**
 * Smooth progress-bar animation using the "transition to full" pattern.
 *
 * On mount (or when `resetKey` changes): renders the fill at its current
 * position (no transition) then, one animation frame later, begins a CSS
 * linear transition targeting `width: 100%` with `remainingMs` as the
 * duration. Each tick the caller re-renders with a new `remainingMs`,
 * updating `transition-duration` so the browser self-corrects the in-flight
 * animation rate without any visual jump.
 *
 * Special cases:
 *  - `remainingMs <= 0` or `pct >= 100` → returns `{ width: '100%' }` (no transition)
 *  - `remainingMs = Infinity` (no timer, static bar) → returns `{ width: '${pct}%' }` (no animation)
 *
 * @param pct         Current fill 0–100, used only to anchor the start position
 * @param remainingMs Estimated ms until completion, updated every clock tick
 * @param resetKey    Change this to force a fresh anchor (e.g. pass `startTick`)
 */
export function useProgressAnimation(
  pct: number,
  remainingMs: number,
  resetKey?: string | number,
): CSSProperties {
  const clamped = Math.max(0, Math.min(100, pct));
  const isComplete = remainingMs <= 0 || pct >= 100;
  const isStatic = !isFinite(remainingMs) && !isComplete;

  const [anchored, setAnchored] = useState(false);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    setAnchored(false);
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => setAnchored(true));
    return () => cancelAnimationFrame(rafRef.current);
  }, [resetKey]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isComplete) {
    return { width: '100%' };
  }

  if (isStatic) {
    return { width: `${clamped}%` };
  }

  if (!anchored) {
    return { width: `${clamped}%` };
  }

  return {
    width: '100%',
    transitionProperty: 'width',
    transitionTimingFunction: 'linear',
    transitionDuration: `${Math.max(0, remainingMs)}ms`,
  };
}
