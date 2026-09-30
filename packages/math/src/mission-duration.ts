import { applyModifier, type ResolvedModifier } from '@derp/shared';
import { durationSecondsToTicks } from './tick';

export interface MissionDurationInput {
  /** Already selected by the caller: phase duration when present, otherwise definition timer duration. */
  durationSeconds: number;
  boostable: boolean;
  /** Resolved mission timer effect. Later phases intentionally do not reapply it. */
  timerModifier?: ResolvedModifier;
  /** Resolved mission synergy duration modifier. Later phases intentionally do not reapply it. */
  synergyDurationModifier?: { percentAdd: number; flatSeconds: number };
  /** Calculated at mission start and persisted for later phases. */
  spdTimerMultiplier: number;
}

/**
 * Reproduces mission timer arithmetic in its original order. In particular,
 * each active modifier has its own floor and minimum; an unmodified duration
 * is not rounded or clamped. Synergy's flat value is rounded before addition.
 */
export function calculateMissionDurationTicks({
  durationSeconds,
  boostable,
  timerModifier,
  synergyDurationModifier,
  spdTimerMultiplier,
}: MissionDurationInput): number {
  let durationTicks = boostable ? durationSecondsToTicks(durationSeconds) : durationSeconds;

  if (timerModifier &&
      (timerModifier.flatAdd !== 0 || timerModifier.percentAdd !== 0 || timerModifier.multiplier !== 1)) {
    durationTicks = Math.max(1, Math.floor(applyModifier(durationTicks, timerModifier)));
  }

  if (synergyDurationModifier) {
    if (synergyDurationModifier.percentAdd !== 0) {
      durationTicks = Math.max(
        1,
        Math.floor(durationTicks * (1 + synergyDurationModifier.percentAdd / 100)),
      );
    }
    if (synergyDurationModifier.flatSeconds !== 0) {
      durationTicks = Math.max(1, durationTicks + Math.round(synergyDurationModifier.flatSeconds));
    }
  }

  if (spdTimerMultiplier < 1) {
    durationTicks = Math.max(1, Math.floor(durationTicks * spdTimerMultiplier));
  }

  return durationTicks;
}