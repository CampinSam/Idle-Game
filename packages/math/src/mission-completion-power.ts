import { calculateSuccessChance } from './success-probability';

export interface MissionCompletionPowerInput {
  baseTeamMP: number;
  synergyScore: number;
  synergyMPPercentAdd: number;
  missionPowerModifier: { flatAdd: number; percentAdd: number; multiplier: number };
  mpEffectivenessCap: number;
  difficulty: number;
  minSuccessChance: number;
  maxSuccessChance: number;
  successChanceModifier: { flatAdd: number; percentAdd: number };
}

/**
 * Completion arithmetic only; all inputs are resolved by the API.
 * Preserve the historical mixed units: the bounded base chance is a fraction,
 * but success-chance flatAdd and percentAdd are added directly and clamped
 * to 0–100, not 0–1. Neither MP nor chance is rounded.
 */
export function calculateMissionCompletionPower({
  baseTeamMP,
  synergyScore,
  synergyMPPercentAdd,
  missionPowerModifier,
  mpEffectivenessCap,
  difficulty,
  minSuccessChance,
  maxSuccessChance,
  successChanceModifier,
}: MissionCompletionPowerInput): { teamMP: number; successChance: number } {
  let rawTeamMP = baseTeamMP;
  if (synergyScore !== 0) rawTeamMP += synergyScore;
  if (synergyMPPercentAdd !== 0) rawTeamMP *= 1 + synergyMPPercentAdd / 100;

  rawTeamMP = rawTeamMP + missionPowerModifier.flatAdd;
  rawTeamMP = rawTeamMP * (1 + missionPowerModifier.percentAdd / 100);
  rawTeamMP = rawTeamMP * missionPowerModifier.multiplier;

  const teamMP = rawTeamMP <= mpEffectivenessCap
    ? rawTeamMP
    : mpEffectivenessCap + Math.sqrt(rawTeamMP - mpEffectivenessCap);
  const baseChance = calculateSuccessChance(teamMP, difficulty, minSuccessChance, maxSuccessChance);
  const successChance = Math.min(
    100,
    Math.max(0, baseChance + successChanceModifier.flatAdd + successChanceModifier.percentAdd),
  );
  return { teamMP, successChance };
}