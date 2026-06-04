import type { RewardOrBundle, EffectOrBundle } from './mission';
import type { Requirements } from './rich-selection';
import type { SkipCostEntry } from './timer';

export type CraftingRecipeId = string;

export type CostEntry = SkipCostEntry;

export interface CraftingRecipe {
  id: CraftingRecipeId;
  name: string;
  description: string;
  cost: CostEntry[];
  timer: import('./timer').Timer;
  rewards?: RewardOrBundle[];
  requirements?: Requirements;
  effects?: EffectOrBundle[];
  visibilityRequirements?: Requirements;
}

export type CraftingJobStatus = 'active' | 'ready_notified' | 'completed' | 'collected';

export interface CraftingJob {
  id: string;
  userId: string;
  recipeId: CraftingRecipeId;
  entityId: string;
  status: CraftingJobStatus;
  startedAt: string;
  completesAt: string;
  result?: CraftingResult;
}

export interface CraftingResult {
  quality: 'common' | 'uncommon' | 'rare' | 'epic';
  craftingLuck: number;
}

export interface StartCraftingDto {
  recipeId: CraftingRecipeId;
  entityId: string;
}

export type DustingQuantityScaling = 'ALL_AT_ONCE' | 'LINEAR';

export interface DustingTierBlock {
  rewards: any[];
  clRequirement?: number;
}

export interface DustingData {
  instant: boolean;
  durationTicks: number;
  quantityScaling: DustingQuantityScaling;
  difficulty: number;
  tiers: Record<string, DustingTierBlock>;
}

export interface StartDustingPayload {
  itemInstanceId: string;
  quantity: number;
}

export interface CollectDustingPayload {
  jobId: string;
}
