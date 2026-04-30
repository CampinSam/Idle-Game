import CyborgEntityCard from './CyborgEntityCard';
import CyborgEntityDetail from './CyborgEntityDetail';
import { meta } from './meta';
import type { EntityViews } from '../../registry';

export const cyborgEntityViews: EntityViews = {
  Card: CyborgEntityCard,
  Detail: CyborgEntityDetail,
  meta,
};
