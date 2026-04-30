import DerpBirdEntityCard from './DerpBirdEntityCard';
import DerpBirdEntityDetail from './DerpBirdEntityDetail';
import { meta } from './meta';
import type { EntityViews } from '../../registry';

export const derpBirdEntityViews: EntityViews = {
  Card: DerpBirdEntityCard,
  Detail: DerpBirdEntityDetail,
  meta,
};
