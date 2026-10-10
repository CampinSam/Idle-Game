import { applyModifier, emptyResolvedModifier } from '@derp/shared';
import {
  calculateMissionDurationTicks,
  durationSecondsToTicks,
  type MissionDurationInput,
} from '../src';

// Frozen reference of the arithmetic previously inside MissionService.startMission.
// Keep this independent of calculateMissionDurationTicks so order/rounding drift
// is caught when the domain function changes.
function previousStartDuration(input: MissionDurationInput): number {
  let ticks = input.boostable
    ? durationSecondsToTicks(input.durationSeconds)
    : input.durationSeconds;
  const timer = input.timerModifier;
  if (timer && (timer.flatAdd !== 0 || timer.percentAdd !== 0 || timer.multiplier !== 1)) {
    ticks = Math.max(1, Math.floor(applyModifier(ticks, timer)));
  }
  const synergy = input.synergyDurationModifier;
  if (synergy) {
    if (synergy.percentAdd !== 0) {
      ticks = Math.max(1, Math.floor(ticks * (1 + synergy.percentAdd / 100)));
    }
    if (synergy.flatSeconds !== 0) {
      ticks = Math.max(1, ticks + Math.round(synergy.flatSeconds));
    }
  }
  if (input.spdTimerMultiplier < 1) {
    ticks = Math.max(1, Math.floor(ticks * input.spdTimerMultiplier));
  }
  return ticks;
}

// Frozen reference of advanceToNextPhase: later phases never re-resolve
// timer effects or mission synergy, only the stored SPD multiplier is reused.
function previousLaterPhaseDuration(
  durationSeconds: number,
  boostable: boolean,
  spdTimerMultiplier: number,
): number {
  let ticks = boostable ? durationSecondsToTicks(durationSeconds) : durationSeconds;
  if (spdTimerMultiplier < 1) {
    ticks = Math.max(1, Math.floor(ticks * spdTimerMultiplier));
  }
  return ticks;
}

const timer = (fields: Partial<{ flatAdd: number; percentAdd: number; multiplier: number }>) =>
  ({ ...emptyResolvedModifier(), ...fields });

describe('mission duration parity with the previous service arithmetic', () => {
  const cases: Array<{ name: string; input: MissionDurationInput; expected: number }> = [
    {
      name: 'ordinary boostable mission with no modifiers',
      input: { durationSeconds: 75, boostable: true, spdTimerMultiplier: 1 },
      expected: 75,
    },
    {
      name: 'unboostable duration remains fractional without modifiers',
      input: { durationSeconds: 1.75, boostable: false, spdTimerMultiplier: 1 },
      expected: 1.75,
    },
    {
      name: 'zero and negative unmodified durations are not silently clamped',
      input: { durationSeconds: 0, boostable: true, spdTimerMultiplier: 1 },
      expected: 0,
    },
    {
      name: 'inactive timer and synergy modifiers do not floor fractions',
      input: {
        durationSeconds: 2.75, boostable: false,
        timerModifier: timer({}), synergyDurationModifier: { percentAdd: 0, flatSeconds: 0 },
        spdTimerMultiplier: 1,
      },
      expected: 2.75,
    },
    {
      name: 'phase-zero resolved duration overrides the definition duration',
      input: { durationSeconds: 13, boostable: false, spdTimerMultiplier: 1 },
      expected: 13,
    },
    {
      name: 'timer flat then percent then multiplier, synergy percent then rounded flat, SPD last',
      input: {
        durationSeconds: 10, boostable: true,
        timerModifier: timer({ flatAdd: 2, percentAdd: 25, multiplier: 1.2 }),
        synergyDurationModifier: { percentAdd: 50, flatSeconds: 1.5 },
        spdTimerMultiplier: 0.6,
      },
      expected: 17,
    },
    {
      name: 'timer modifier floors before synergy rather than after it',
      input: {
        durationSeconds: 3.7, boostable: false,
        timerModifier: timer({ percentAdd: 10 }),
        synergyDurationModifier: { percentAdd: 50, flatSeconds: -0.5 },
        spdTimerMultiplier: 1,
      },
      expected: 6,
    },
    {
      name: 'negative timer modifier floors to one',
      input: { durationSeconds: 0, boostable: true, timerModifier: timer({ flatAdd: -20 }), spdTimerMultiplier: 1 },
      expected: 1,
    },
    {
      name: 'synergy percent and flat each have their own one-tick floor',
      input: {
        durationSeconds: 2, boostable: true,
        synergyDurationModifier: { percentAdd: -200, flatSeconds: -5.5 },
        spdTimerMultiplier: 1,
      },
      expected: 1,
    },
    {
      name: 'SPD reduction floors to one, but multiplier at or above one does not change duration',
      input: { durationSeconds: 0.5, boostable: true, spdTimerMultiplier: 0 },
      expected: 1,
    },
    {
      name: 'SPD above one does not lengthen mission',
      input: { durationSeconds: 2.25, boostable: true, spdTimerMultiplier: 1.1 },
      expected: 2.25,
    },
  ];

  it.each(cases)('$name', ({ input, expected }) => {
    expect(calculateMissionDurationTicks(input)).toBe(previousStartDuration(input));
    expect(calculateMissionDurationTicks(input)).toBe(expected);
  });

  it.each([
    { durationSeconds: 9.5, boostable: false, spdTimerMultiplier: 1, expected: 9.5 },
    { durationSeconds: 9.5, boostable: true, spdTimerMultiplier: 0.6, expected: 5 },
    { durationSeconds: 0, boostable: true, spdTimerMultiplier: 0.6, expected: 1 },
  ])('later phase duration %# keeps only its persisted SPD reduction', (example) => {
    const { expected, ...input } = example;
    expect(calculateMissionDurationTicks(input)).toBe(
      previousLaterPhaseDuration(input.durationSeconds, input.boostable, input.spdTimerMultiplier),
    );
    expect(calculateMissionDurationTicks(input)).toBe(expected);
  });
});