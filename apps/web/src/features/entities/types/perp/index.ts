import PerpEntityCard from './PerpEntityCard';
import PerpEntityDetail from './PerpEntityDetail';
import { meta } from './meta';
import type { EntityViews } from '../../registry';

export const perpEntityViews: EntityViews = {
  Card: PerpEntityCard,
  Detail: PerpEntityDetail,
  meta,
};
