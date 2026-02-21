export function getTickRemainingMs(item: any, now: number): number {
  const { startTick, durationTicks } = item;
  const currentTick = item.tickInfo?.currentTick;
  const currentRate = item.tickInfo?.currentRate;
  const serverTime = item.serverTime;

  if (startTick == null || durationTicks == null || currentTick == null || currentRate == null || serverTime == null) {
    return Infinity;
  }

  const endTick = startTick + durationTicks;
  const remainingTicks = endTick - currentTick;
  if (remainingTicks <= 0) return 0;

  const remainingMsAtServerTime = (remainingTicks / currentRate) * 1000;
  const elapsed = now - new Date(serverTime).getTime();
  return Math.max(0, remainingMsAtServerTime - elapsed);
}

export function getTickTotalDurationMs(item: any): number {
  const durationTicks = item.durationTicks;
  const currentRate = item.tickInfo?.currentRate;
  if (!durationTicks || !currentRate) return 1;
  return (durationTicks / currentRate) * 1000;
}

export function getTickProgress(item: any, now: number): number {
  const total = getTickTotalDurationMs(item);
  const remaining = getTickRemainingMs(item, now);
  if (total <= 0 || remaining === Infinity) return 2;
  return Math.min(100, Math.max(2, ((total - remaining) / total) * 100));
}
