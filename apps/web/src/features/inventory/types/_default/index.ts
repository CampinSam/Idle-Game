import DefaultItemCard from './DefaultItemCard';
import DefaultItemDetailPanel from './DefaultItemDetailPanel';
import { meta } from './meta';
import type { ItemViews } from '../../registry';

export { DefaultItemCard as ItemCard, DefaultItemDetailPanel as ItemDetailPanel };

export const defaultItemViews: ItemViews = {
  Card: DefaultItemCard,
  DetailPanel: DefaultItemDetailPanel,
  meta,
};
