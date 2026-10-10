import DefaultEntityCard from './DefaultEntityCard';
import DefaultEntityDetail from './DefaultEntityDetail';
import { meta } from './meta';
import type { EntityViews } from '../../registry';

export { DefaultEntityCard as EntityCard, DefaultEntityDetail as EntityDetail };

export const defaultEntityViews: EntityViews = {
  Card: DefaultEntityCard,
  Detail: DefaultEntityDetail,
  meta,
};
