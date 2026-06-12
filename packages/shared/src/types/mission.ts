import type { Requirements } from './rich-selection';

export type MissionStatus = 'active' | 'completed' | 'failed' | 'phase_ready' | 'abandoned';

export type RewardsMode = 'per_phase' | 'final_bundle' | 'hybrid';

export type ContinueRuleAction = 'next_phase' | 'complete' | 'end_job' | 'wait';

export interface ContinueRules {
  onSuccess: ContinueRuleAction;
  onFailure: ContinueRuleAction;
}

export interface MissionPhaseDefinition {
  name?: string;
  description?: string;
  duration: number;
  difficulty?: number;
  requirements?: Requirements;
  modifiers?: Record<string, any>;
  successOutcome?: any;
  failureOutcome?: any;
  tiers?: Record<string, any>;
  continueRules: ContinueRules;
  count?: number;
  maxFailuresForCount?: number;
  allowRetry?: boolean;
  injuryRate?: number;
  injuryRecoveryTicks?: number;
  injuryPenalty?: number;
  injuryPenaltyDuration?: number;
}

export interface InjuryEntry {
  entityId: string;
  penalty: number;
  remainingPenaltyTicks: number;
}

export interface MissionAccumulatedState {
  injuries: InjuryEntry[];
  currentPhaseSuccesses: number;
  currentPhaseFailures: number;
  totalMissionFailures: number;
  bankedRewards?: any[];
}

export interface PhaseResult {
  phaseIndex: number;
  phaseName: string;
  success: boolean;
  quality?: string;
  rewards?: any[];
  injuredEntityIds?: string[];
}

export interface RewardEntry {
  type: 'entity_xp' | 'keeper_xp' | 'currency' | 'item';
  key?: string;
  min: number;
  max: number;
  odds?: number;
}

export interface EffectEntry {
  type: 'flag';
  operation: 'set' | 'increment' | 'decrement' | 'invert';
  key: string;
  value?: number | string | boolean;
  odds?: number;
}

export interface TextEntry {
  type: 'text';
  message: string;
  behavior?: 'overwrite' | 'append';
  odds?: number;
}

export type OutcomeEntry = RewardEntry | EffectEntry | TextEntry;

export interface OutcomeBundle {
  bundle: OutcomeOrBundle[];
  odds?: number;
  pickMin?: number;
  pickMax?: number;
  requirements?: Requirements;
}

export interface BundleRefEntry {
  type: 'bundle_ref';
  bundleDefId: string;
  odds?: number;
  pickMin?: number;
  pickMax?: number;
  requirements?: Requirements;
}

export interface BundleDefinition {
  id: string;
  name: string;
  description?: string;
  version: number;
  bundle: OutcomeOrBundle[];
  odds?: number;
  pickMin?: number;
  pickMax?: number;
  enabled: boolean;
}

export type OutcomeOrBundle = OutcomeEntry | OutcomeBundle | BundleRefEntry;

export interface OutcomeBlock {
  rewards: OutcomeOrBundle[];
}

export interface MissionDefinition {
  id: string;
  name: string;
  description: string;
  difficulty: number;
  mode?: 'single' | 'multi_phase';
  phases?: MissionPhaseDefinition[];
  rewardsMode?: RewardsMode;
  maxFailures?: number;
  injuryRate?: number;
  injuryRecoveryTicks?: number;
  timer: import('./timer').Timer;
  success: OutcomeBlock;
  failure: OutcomeBlock;
  requirements: Requirements;
  visibilityRequirements?: Requirements;
}

export interface Mission {
  id: string;
  userId: string;
  defId: string;
  difficulty: number;
  team: string[];
  status: MissionStatus;
  startedAt: string;
  completesAt: string;
  result?: MissionResult;
}

export interface MissionResult {
  success: boolean;
  xpEarned: number;
  arcaniumEarned: number;
  itemsFound: string[];
  seed: string;
}

export interface StartMissionDto {
  defId: string;
  entityIds: string[];
}

/** @deprecated Use OutcomeOrBundle instead */
export type RewardOrBundle = OutcomeOrBundle;
/** @deprecated Use OutcomeOrBundle instead */
export type EffectOrBundle = OutcomeOrBundle;

export function isBundle(entry: OutcomeOrBundle): entry is OutcomeBundle;
export function isBundle<T>(entry: T | { bundle: T[]; odds?: number }): entry is { bundle: T[]; odds?: number };
export function isBundle(entry: any): entry is { bundle: any[]; odds?: number } {
  return entry !== null && typeof entry === 'object' && 'bundle' in entry && Array.isArray((entry as any).bundle);
}
