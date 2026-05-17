/**
 * Normalized per-entity shape passed to the SynergyResolverService.
 * Callers (mission, crafting, outpost) build these from their fetched entities.
 */
export interface SynergyEntityDescriptor {
  entityId?: string;
  entityType?: string;
  speciesId?: string;
  collectionId?: string;
  traits: Record<string, string>;
  rarity?: string;
  regionId?: string;
  locationTypes?: string[];
  buildingTags?: string[];
  missionTags?: string[];
}

/**
 * Activity context describing the game situation in which synergy is evaluated.
 */
export interface SynergyActivityContext {
  activityType: string;
  missionType?: string;
  missionTags?: string[];
  regionId?: string;
  seasonId?: string;
  teamSize?: number;
}


export interface SynergyEffect {
  type:
    | 'synergy_score_modifier'
    | 'stat_modifier'
    | 'duration_modifier'
    | 'resource_yield_modifier'
    | 'immunity';
  operation?: 'flat_add' | 'percent_add' | 'multiplier' | 'flat_seconds';
  value?: number;
  stat?: string;
  activity?: string;
  resourceId?: string;
  immuneTo?: string;
}

export interface MatchedRule {
  ruleId: string;
  name: string;
  applications: number;
  effects: SynergyEffect[];
}

export interface StatModifierTotals {
  flat: number;
  percentAdd: number;
  multiplier: number;
}

export interface DurationModifierTotals {
  flatSeconds: number;
  percentAdd: number;
  multiplier: number;
}

export interface ResourceYieldModifier {
  resourceId: string;
  flat: number;
  percentAdd: number;
  multiplier: number;
}

export interface SynergyTotals {
  synergyScore: number;
  statModifiers: Record<string, StatModifierTotals>;
  durationModifiers: Record<string, DurationModifierTotals>;
  resourceYieldModifiers: ResourceYieldModifier[];
  immunities: string[];
}

export interface SynergyResult {
  matchedRules: MatchedRule[];
  totals: SynergyTotals;
}
