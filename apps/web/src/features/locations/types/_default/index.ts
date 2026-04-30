import DefaultCard from './DefaultCard';
import DefaultPage from './DefaultPage';
import { meta } from './meta';
import type { LocationViews } from '../../registry';

export { DefaultCard as LocationCard, DefaultPage as LocationPage };

export const defaultViews: LocationViews = {
  Card: DefaultCard,
  Page: DefaultPage,
  meta,
};
