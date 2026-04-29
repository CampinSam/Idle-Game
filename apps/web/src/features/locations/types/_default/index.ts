import DefaultCard from './DefaultCard';
import DefaultPage from './DefaultPage';
import { meta } from './meta';
import type { LocationViews } from '../../registry';

export const defaultViews: LocationViews = {
  Card: DefaultCard,
  Page: DefaultPage,
  meta,
};
