import DerpOutpostCard from './DerpOutpostCard';
import DerpOutpostPage from './DerpOutpostPage';
import { meta } from './meta';
import type { LocationViews } from '../../registry';

export const derpOutpostViews: LocationViews = {
  Card: DerpOutpostCard,
  Page: DerpOutpostPage,
  meta,
};
