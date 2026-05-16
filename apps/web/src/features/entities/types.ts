import type { ReactNode } from 'react';
import type { Entity } from '@derp/shared';

export type EntityUseCase = 'browse' | 'mission' | 'crafting' | 'outpost' | 'potion-picker';

export type EntityFilter = string;

export type EntitySortBy = 'name' | 'level' | 'power' | 'collection';

export type EntityListMode = 'display' | 'picker';

export type EntityListLayout = 'grid' | 'team' | 'picker' | 'wide';

export type EntityDetailVariant = 'full' | 'lightweight';

export interface EntityForecast {
  craftingLuck: number;
  rawCraftingLuck?: number;
  expectedQuality: string;
  expectedQualityLabel: string;
  probabilities: Array<{ key: string; label: string; probability: number }>;
}

export interface EntityCardProps {
  entity: any;
  useCase?: EntityUseCase;
  selected?: boolean;
  disabled?: boolean;
  disabledTooltip?: string;
  active?: boolean;
  onClick?: (entity: any) => void;
  onRemove?: (entity: any) => void;
  forecast?: EntityForecast | null;
  qualityColors?: Record<string, string>;
  extras?: ReactNode;
  className?: string;
  compact?: boolean;
  tagOverride?: { label: string; color: string };
}

export interface EntityDetailProps {
  entity: Entity;
  variant?: EntityDetailVariant;
  useCase?: EntityUseCase;
  showHeader?: boolean;
  onBack?: () => void;
  /** Slots for action chips in lightweight mode (e.g. mission Remove button). */
  onRemove?: (entity: Entity) => void;
  /** Optional badge rendered below the level badge on the portrait card. */
  portraitBadge?: ReactNode;
}
