import type { ComponentType } from 'react';

export interface LocationCardProps {
  outpost: any;
  onClick?: () => void;
  isPrimary?: boolean;
  isInactive?: boolean;
}

export interface LocationPageProps {
  outpost: any;
}

export interface LocationMeta {
  label: string;
  iconKey?: string;
}

export interface LocationViews {
  Card: ComponentType<LocationCardProps>;
  Page: ComponentType<LocationPageProps>;
  meta: LocationMeta;
}

import { defaultViews } from './types/_default';
import { derpOutpostViews } from './types/derpOutpost';

const KIND_REGISTRY: Record<string, LocationViews> = {
  'Derp Outpost': derpOutpostViews,
  'derp_outpost': derpOutpostViews,
  'outpost_fungible': derpOutpostViews,
};

const UNIQUE_REGISTRY: Record<string, LocationViews> = {};

export function getLocationViews(
  kind: string,
  isUnique: boolean,
  definitionId?: string,
): LocationViews {
  if (isUnique && definitionId && UNIQUE_REGISTRY[definitionId]) {
    return UNIQUE_REGISTRY[definitionId];
  }
  if (kind && KIND_REGISTRY[kind]) {
    return KIND_REGISTRY[kind];
  }
  return defaultViews;
}
