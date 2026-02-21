import type { Requirement, RewardOrBundle, EffectOrBundle } from './mission';

export type CraftingRecipeId = string;

export interface CraftingRecipe {
  id: CraftingRecipeId;
  name: string;
  description: string;
  cost: Record<string, number>;
  timer: import('./timer').Timer;
  requiredKeeperLevel: number;
  rewards?: RewardOrBundle[];
  requirements?: Requirement[];
  effects?: EffectOrBundle[];
  visibilityRequirements?: Requirement[];
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
