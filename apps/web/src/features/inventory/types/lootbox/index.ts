import LootboxItemCard from './LootboxItemCard';
import LootboxItemDetailPanel from './LootboxItemDetailPanel';
import { meta } from './meta';
import type { ItemViews } from '../../registry';

export const lootboxItemViews: ItemViews = {
  Card: LootboxItemCard,
  DetailPanel: LootboxItemDetailPanel,
  meta,
};
