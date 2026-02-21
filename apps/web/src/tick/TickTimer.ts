export interface TickTimerConfig {
  startValue: number;
  perTick: number;
  startTick: number;
  min?: number;
  max?: number;
}

export class TickTimer {
  readonly startValue: number;
  readonly perTick: number;
  readonly startTick: number;
  readonly min: number;
  readonly max: number;

  constructor(config: TickTimerConfig) {
    this.startValue = config.startValue;
    this.perTick = config.perTick;
    this.startTick = config.startTick;
    this.min = config.min ?? 0;
    this.max = config.max ?? Infinity;
  }

  getValue(currentTick: number): number {
    const elapsed = currentTick - this.startTick;
    if (elapsed < 0) return Math.min(Math.max(this.startValue, this.min), this.max);
    const raw = this.startValue + this.perTick * elapsed;
    return Math.min(Math.max(raw, this.min), this.max);
  }

  getProgress(currentTick: number): number {
    if (this.max === Infinity || this.max <= this.min) return 0;
    const val = this.getValue(currentTick);
    return Math.min(100, Math.max(0, ((val - this.min) / (this.max - this.min)) * 100));
  }

  isComplete(currentTick: number): boolean {
    const val = this.getValue(currentTick);
    if (this.perTick >= 0) return val >= this.max;
    return val <= this.min;
  }

  getRemainingMs(currentTick: number, tickRate: number): number {
    if (this.perTick === 0 || tickRate <= 0) return Infinity;
    const val = this.getValue(currentTick);

    let target: number;
    if (this.perTick > 0) {
      target = this.max;
      if (val >= target) return 0;
    } else {
      target = this.min;
      if (val <= target) return 0;
    }

    const remainingValue = Math.abs(target - val);
    const remainingTicks = remainingValue / Math.abs(this.perTick);
    return (remainingTicks / tickRate) * 1000;
  }
}

export function createAccumulatorTimer(opts: {
  currentAmount: number;
  ratePerTick: number;
  lastAccruedTick: number;
  capacity: number;
}): TickTimer {
  return new TickTimer({
    startValue: opts.currentAmount,
    perTick: opts.ratePerTick,
    startTick: opts.lastAccruedTick,
    min: 0,
    max: opts.capacity,
  });
}

export function createCountdownTimer(opts: {
  startTick: number;
  durationTicks: number;
}): TickTimer {
  return new TickTimer({
    startValue: opts.durationTicks,
    perTick: -1,
    startTick: opts.startTick,
    min: 0,
    max: opts.durationTicks,
  });
}
