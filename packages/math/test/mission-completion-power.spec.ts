import { calculateMissionCompletionPower, type MissionCompletionPowerInput } from '../src';

const defaults: MissionCompletionPowerInput = {
  baseTeamMP: 100,
  synergyScore: 0,
  synergyMPPercentAdd: 0,
  missionPowerModifier: { flatAdd: 0, percentAdd: 0, multiplier: 1 },
  mpEffectivenessCap: 500,
  difficulty: 100,
  minSuccessChance: 0,
  maxSuccessChance: 100,
  successChanceModifier: { flatAdd: 0, percentAdd: 0 },
};

// Independent reference of the former completeMission arithmetic, including
// the historical fraction/percentage mismatch and bound ordering.
function previousCalculation(input: MissionCompletionPowerInput) {
  let rawTeamMP = input.baseTeamMP;
  if (input.synergyScore !== 0) rawTeamMP += input.synergyScore;
  if (input.synergyMPPercentAdd !== 0) rawTeamMP *= 1 + input.synergyMPPercentAdd / 100;
  let v = rawTeamMP + input.missionPowerModifier.flatAdd;
  v = v * (1 + input.missionPowerModifier.percentAdd / 100);
  v = v * input.missionPowerModifier.multiplier;
  rawTeamMP = v;
  const cap = input.mpEffectivenessCap;
  const teamMP = rawTeamMP <= cap ? rawTeamMP : cap + Math.sqrt(rawTeamMP - cap);
  let successChance = Math.min(
    Math.max(teamMP / (teamMP + input.difficulty), input.minSuccessChance / 100),
    input.maxSuccessChance / 100,
  );
  successChance = Math.min(100, Math.max(
    0, successChance + input.successChanceModifier.flatAdd + input.successChanceModifier.percentAdd,
  ));
  return { teamMP, successChance };
}

describe('calculateMissionCompletionPower parity', () => {
  const cases: Array<{
    name: string;
    changes: Partial<MissionCompletionPowerInput>;
    teamMP: number;
    successChance: number;
  }> = [
    { name: 'ordinary values use fractional probability', changes: {}, teamMP: 100, successChance: 0.5 },
    { name: 'no rounding of fractional MP', changes: { baseTeamMP: 100.25 }, teamMP: 100.25, successChance: 100.25 / 200.25 },
    { name: 'stack synergy before flat/percent/multiplier effects', changes: {
      synergyScore: 20, synergyMPPercentAdd: 25,
      missionPowerModifier: { flatAdd: 10, percentAdd: 50, multiplier: 2 },
    }, teamMP: 480, successChance: 480 / 580 },
    { name: 'MP exactly at cap', changes: { baseTeamMP: 500 }, teamMP: 500, successChance: 500 / 600 },
    { name: 'MP just above cap preserves square-root fraction', changes: { baseTeamMP: 500.25 }, teamMP: 500.5, successChance: 500.5 / 600.5 },
    { name: 'large MP uses cap plus sqrt of excess', changes: { baseTeamMP: 900 }, teamMP: 520, successChance: 520 / 620 },
    { name: 'effects are applied before the cap', changes: {
      missionPowerModifier: { flatAdd: 0, percentAdd: 0, multiplier: 9 },
    }, teamMP: 520, successChance: 520 / 620 },
    { name: 'zero difficulty', changes: { difficulty: 0 }, teamMP: 100, successChance: 1 },
    { name: 'low difficulty is not rescaled', changes: { difficulty: 0.01 }, teamMP: 100, successChance: 100 / 100.01 },
    { name: 'high difficulty', changes: { difficulty: 1e9 }, teamMP: 100, successChance: 100 / (100 + 1e9) },
    { name: 'zero MP at positive difficulty', changes: { baseTeamMP: 0 }, teamMP: 0, successChance: 0 },
    { name: 'zero MP and difficulty preserves NaN', changes: { baseTeamMP: 0, difficulty: 0 }, teamMP: 0, successChance: NaN },
    { name: 'minimum chance is expressed in percent', changes: { minSuccessChance: 75 }, teamMP: 100, successChance: 0.75 },
    { name: 'maximum chance is expressed in percent', changes: { maxSuccessChance: 25 }, teamMP: 100, successChance: 0.25 },
    { name: 'inverted bounds retain existing ordering', changes: { minSuccessChance: 80, maxSuccessChance: 20 }, teamMP: 100, successChance: 0.2 },
    { name: 'chance additions are direct numbers, not scaled percentages', changes: {
      successChanceModifier: { flatAdd: 2, percentAdd: 3 },
    }, teamMP: 100, successChance: 5.5 },
    { name: 'chance effects can exceed the definition maximum', changes: {
      maxSuccessChance: 25, successChanceModifier: { flatAdd: 0.5, percentAdd: 0 },
    }, teamMP: 100, successChance: 0.75 },
    { name: 'chance effects clamp at 100, not 1', changes: {
      successChanceModifier: { flatAdd: 100, percentAdd: 20 },
    }, teamMP: 100, successChance: 100 },
    { name: 'negative chance effects clamp to zero', changes: {
      successChanceModifier: { flatAdd: -2, percentAdd: 0 },
    }, teamMP: 100, successChance: 0 },
    { name: 'negative MP is not clamped', changes: { baseTeamMP: -10 }, teamMP: -10, successChance: 0 },
  ];

  it.each(cases)('$name', ({ changes, teamMP, successChance }) => {
    const input = { ...defaults, ...changes };
    const before = structuredClone(input);
    const result = calculateMissionCompletionPower(input);
    expect(result).toEqual(previousCalculation(input));
    expect(result).toEqual({ teamMP, successChance });
    expect(input).toEqual(before);
  });
});