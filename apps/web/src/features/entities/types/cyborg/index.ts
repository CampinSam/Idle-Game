import CyborgEntityCard from './CyborgEntityCard';
import DefaultEntityDetail from '../_default/DefaultEntityDetail';
import { meta } from './meta';
import type { EntityViews } from '../../registry';

export const cyborgEntityViews: EntityViews = {
  Card: CyborgEntityCard,
  Detail: DefaultEntityDetail,
  meta,
};
