import { getEntityViews, getEntityArchetype } from '../registry';
import type { EntityDetailProps } from '../types';

export default function EntityDetail(props: EntityDetailProps) {
  const archetype = getEntityArchetype(props.entity);
  const Detail = getEntityViews(archetype, props.entity?.kind).Detail;
  return <Detail {...props} />;
}
