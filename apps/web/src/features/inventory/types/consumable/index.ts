import ConsumableItemCard from './ConsumableItemCard';
import DefaultItemDetailPanel from '../_default/DefaultItemDetailPanel';
import { meta } from './meta';
import type { ItemViews } from '../../registry';

export const consumableItemViews: ItemViews = {
  Card: ConsumableItemCard,
  DetailPanel: DefaultItemDetailPanel,
  meta,
};
