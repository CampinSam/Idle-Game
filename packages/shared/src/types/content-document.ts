// ─── Content Document Context ─────────────────────────────────────────────────

/**
 * The rendering context for a content document.
 * Surfaces (screens, modals) supply base context; client override rules
 * can update it in response to live SSE-driven state changes.
 */
export interface ContentDocumentContext {
  /** Which phase of the mission lifecycle is being shown. */
  missionMode?: 'planning' | 'in_progress' | 'outcome';
  /** Whether the team is interactively editable or read-only. */
  teamMode?: 'editable' | 'locked';
  /** Whether rewards are a preview estimate or actual collected values. */
  rewardMode?: 'preview' | 'actual';
  /** Arbitrary additional context values for future block types. */
  [key: string]: unknown;
}

// ─── Surface Context Override Rules ──────────────────────────────────────────

export type SurfaceContextOverrideTrigger =
  | 'job.completed'
  | 'job.failed'
  | 'job.ready';

/**
 * A declared rule that updates the document context when a live event fires.
 * The vocabulary is intentionally small — no arbitrary expression evaluation.
 * The `jobId` field scopes the trigger to a specific job in the sync store.
 */
export interface SurfaceContextOverrideRule {
  on: SurfaceContextOverrideTrigger;
  jobId?: string;
  apply: Partial<ContentDocumentContext>;
}

// ─── Content Blocks ───────────────────────────────────────────────────────────

// Mission-pilot game-specific block types

export interface ContentBlockMissionHero {
  type: 'mission_hero';
}

export interface ContentBlockMissionStats {
  type: 'mission_stats';
}

export interface ContentBlockMissionRequirements {
  type: 'mission_requirements';
}

export interface ContentBlockMissionStatsRequirements {
  type: 'mission_stats_requirements';
}

export interface ContentBlockMissionSynergy {
  type: 'mission_synergy';
}

export interface ContentBlockMissionPlanningSticky {
  type: 'mission_planning_sticky';
}

export interface ContentBlockTeamSection {
  type: 'team_section';
}

export interface ContentBlockRewardList {
  type: 'reward_list';
}

export interface ContentBlockNarrativeText {
  type: 'narrative_text';
  /** Static fallback text shown when no dynamic narrative is available. */
  text?: string;
}

// Generic passthrough block types

export interface ContentBlockRichText {
  type: 'rich_text';
  /** Plain text content. Rich doc structure is resolved by the renderer. */
  content?: string;
}

export interface ContentBlockImage {
  type: 'image';
  assetKey?: string;
  caption?: string;
  display?: import('./modal').ImageDisplay;
}

export interface ContentBlockDivider {
  type: 'divider';
}

export interface ContentBlockKeyValueRow {
  type: 'key_value_row';
  label: string;
  value: string;
}

/** Discriminated union of all supported content block types. */
export type ContentBlock =
  | ContentBlockMissionHero
  | ContentBlockMissionStats
  | ContentBlockMissionRequirements
  | ContentBlockMissionStatsRequirements
  | ContentBlockMissionSynergy
  | ContentBlockMissionPlanningSticky
  | ContentBlockTeamSection
  | ContentBlockRewardList
  | ContentBlockNarrativeText
  | ContentBlockRichText
  | ContentBlockImage
  | ContentBlockDivider
  | ContentBlockKeyValueRow;

export type ContentBlockType = ContentBlock['type'];

export const CONTENT_BLOCK_TYPES: ContentBlockType[] = [
  'mission_hero',
  'mission_stats',
  'mission_requirements',
  'mission_stats_requirements',
  'mission_synergy',
  'mission_planning_sticky',
  'team_section',
  'reward_list',
  'narrative_text',
  'rich_text',
  'image',
  'divider',
  'key_value_row',
];

// ─── Content Document Definition ─────────────────────────────────────────────

/**
 * A reusable, surface-agnostic block list stored in the GameDefinition table
 * with `type = 'content_document'`.
 *
 * Content documents own block order, content structure, and conditional hints.
 * They do NOT own navigation, modal buttons, routing, or close behaviour —
 * those belong to the screen or modal surface that renders the document.
 */
export interface ContentDocumentDefinition {
  /** Stable identifier — matches the `key` column in GameDefinition. */
  id: string;
  /** Schema version for forward-compatibility. */
  version: number;
  /** Ordered list of blocks to render. */
  blocks: ContentBlock[];
  /**
   * Optional default context hints for this document.
   * Surfaces may override these at render time.
   */
  context?: ContentDocumentContext;
}
