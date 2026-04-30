import type { ComponentType } from 'react';
import type { EntityCardProps, EntityDetailProps } from './types';

export interface EntityMeta {
  label: string;
  iconKey?: string;
}

export interface EntityViews {
  Card: ComponentType<EntityCardProps>;
  Detail: ComponentType<EntityDetailProps>;
  meta: EntityMeta;
}

import { defaultEntityViews } from './types/_default';
import { cyborgEntityViews } from './types/cyborg';

const ARCHETYPE_REGISTRY: Record<string, EntityViews> = {
  cyborg: cyborgEntityViews,
};

const KIND_REGISTRY: Record<string, EntityViews> = {};

export function getEntityViews(
  archetype?: string | null,
  kind?: string | null,
): EntityViews {
  if (archetype && ARCHETYPE_REGISTRY[archetype]) return ARCHETYPE_REGISTRY[archetype];
  if (kind && KIND_REGISTRY[kind]) return KIND_REGISTRY[kind];
  return defaultEntityViews;
}

export function getEntityArchetype(entity: any): string {
  return (entity?.traits?.body || entity?.traits?.head || '') as string;
}
