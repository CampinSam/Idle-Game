import DerpOutpostCard from './DerpOutpostCard';
import DerpOutpostPage from './DerpOutpostPage';
import { meta } from './meta';
import type { LocationViews } from '../../registry';

export { DerpOutpostCard as LocationCard, DerpOutpostPage as LocationPage };

export const derpOutpostViews: LocationViews = {
  Card: DerpOutpostCard,
  Page: DerpOutpostPage,
  meta,
};
