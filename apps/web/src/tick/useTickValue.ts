import { useMemo } from 'react';
import { useCurrentTick, useTickRate } from './TickEngine';
import { TickTimer } from './TickTimer';

export function useTickValue(timer: TickTimer | null | undefined): number {
  const currentTick = useCurrentTick();
  return timer ? timer.getValue(currentTick) : 0;
}

export function useTickProgress(timer: TickTimer | null | undefined): number {
  const currentTick = useCurrentTick();
  return timer ? timer.getProgress(currentTick) : 0;
}

export function useTickComplete(timer: TickTimer | null | undefined): boolean {
  const currentTick = useCurrentTick();
  return timer ? timer.isComplete(currentTick) : false;
}

export function useTickRemainingMs(timer: TickTimer | null | undefined): number {
  const currentTick = useCurrentTick();
  const tickRate = useTickRate();
  return timer ? timer.getRemainingMs(currentTick, tickRate) : Infinity;
}

export function useTickValues(timers: (TickTimer | null | undefined)[]): number[] {
  const currentTick = useCurrentTick();
  return useMemo(
    () => timers.map((t) => (t ? t.getValue(currentTick) : 0)),
    [timers, currentTick],
  );
}
