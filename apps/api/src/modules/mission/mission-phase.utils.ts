import { calculateMP, calculateInjuryRecoveryTicks, calculateInjuryPenaltyMultiplier } from '@derp/math';

export interface PhaseInjury {
  entityId: string;
  /** Direct MP multiplier (e.g. 0.8 = entity operates at 80% MP). Multiple injuries compound multiplicatively. */
  penalty: number;
  remainingPenaltyTicks: number;
}

/**
 * Compute team MP with per-entity injury penalties applied multiplicatively.
 * `penalty` is a direct multiplier (e.g. 0.8); multiple injuries on the same entity
 * compound: 0.8 * 0.7 = 0.56 (entity operates at 56% MP).
 */
export function applyInjuryPenalties(
  entities: Array<{ id: string; stats: any }>,
  injuries: PhaseInjury[],
): number {
  return entities.reduce((sum, e) => {
    const entityInjuries = injuries.filter((i) => i.entityId === e.id);
    const penaltyFactor = entityInjuries.reduce(
      (f, inj) => f * Math.max(0, inj.penalty ?? 1),
      1,
    );
    return sum + calculateMP((e.stats as any) ?? {}) * penaltyFactor;
  }, 0);
}

/**
 * Reduce each injury's remainingPenaltyTicks by ticksElapsed.
 * Injuries whose remaining time drops to ≤0 are removed (entity healed naturally mid-expedition).
 */
export function tickDownInjuryPenalties(
  injuries: PhaseInjury[],
  ticksElapsed: number,
): PhaseInjury[] {
  return injuries
    .map((inj) => ({ ...inj, remainingPenaltyTicks: inj.remainingPenaltyTicks - ticksElapsed }))
    .filter((inj) => inj.remainingPenaltyTicks > 0);
}

/**
 * Build a map of entityId → injuredUntilTick from accumulated injuries.
 * When an entity has multiple injuries, the maximum remaining ticks wins —
 * the entity stays injured until their longest-running injury clears.
 * Uses remainingPenaltyTicks DIRECTLY; no additional recovery math is applied.
 */
export function buildInjuredUntilMap(
  injuries: PhaseInjury[],
  currentTick: number,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const inj of injuries) {
    if (typeof inj.remainingPenaltyTicks === 'number' && inj.remainingPenaltyTicks > 0) {
      const existing = map.get(inj.entityId) ?? 0;
      map.set(inj.entityId, Math.max(existing, currentTick + inj.remainingPenaltyTicks));
    }
  }
  return map;
}

/**
 * Compute the initial remainingPenaltyTicks for a newly-suffered injury, with VIT applied.
 * Reads phase-level `injuryPenaltyDuration` first, falls back to def-level `injuryRecoveryTicks`.
 * VIT reduces duration using the same curve as single-phase recovery:
 *   ticks = baseTicks * (1 - VIT / (VIT + 100))
 * Result is stored so it can be ticked down linearly through phases and used directly at mission end.
 */
export function computeInitialPenaltyTicks(phase: any, def: any, vit = 0): number {
  const baseTicks: number = (phase as any).injuryPenaltyDuration ?? (def as any).injuryRecoveryTicks ?? 0;
  return calculateInjuryRecoveryTicks(baseTicks, vit);
}

/**
 * Compute the VIT-adjusted MP penalty multiplier for a newly-suffered injury.
 * Reads phase-level `injuryPenalty` first (default 0.8).
 * VIT reduces the severity of the penalty using the same curve as duration:
 *   adjustedPenalty = 1 - (1 - basePenalty) * (1 - VIT / (VIT + 100))
 */
export function computeInjuryPenaltyForEntity(phase: any, vit = 0): number {
  const basePenalty: number = (phase as any).injuryPenalty ?? 0.8;
  return calculateInjuryPenaltyMultiplier(basePenalty, vit);
}

/**
 * Decrement remainingUses on session-scoped (mission) ActiveEffect rows for one phase attempt.
 * Effects that reach zero uses are deleted immediately.
 * Call once per phase attempt completion in the tick processor.
 */
export async function consumeSessionEffectCharges(jobId: string, db: any): Promise<void> {
  const effects = await (db as any).activeEffect.findMany({
    where: { sessionType: 'mission', sessionId: jobId, remainingUses: { not: null } },
    select: { id: true, remainingUses: true },
  });
  for (const eff of effects) {
    const newUses = (eff.remainingUses ?? 1) - 1;
    if (newUses <= 0) {
      await (db as any).activeEffect.delete({ where: { id: eff.id } });
    } else {
      await (db as any).activeEffect.update({
        where: { id: eff.id },
        data: { remainingUses: newUses },
      });
    }
  }
}
