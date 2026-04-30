import type { ComponentType } from 'react';
import type { ItemCardProps, ItemDetailPanelProps } from './types';

export interface ItemMeta {
  label: string;
  iconKey?: string;
}

export interface ItemViews {
  Card: ComponentType<ItemCardProps>;
  DetailPanel: ComponentType<ItemDetailPanelProps>;
  meta: ItemMeta;
}

import { defaultItemViews } from './types/_default';

const TYPE_REGISTRY: Record<string, ItemViews> = {};

const DEF_REGISTRY: Record<string, ItemViews> = {};

export function getItemViews(item: any): ItemViews {
  const defId = item?.itemDefId || item?.definitionId || item?.id;
  if (defId && DEF_REGISTRY[defId]) return DEF_REGISTRY[defId];
  const itemType = item?.type || item?.definition?.type;
  if (itemType && TYPE_REGISTRY[itemType]) return TYPE_REGISTRY[itemType];
  return defaultItemViews;
}
