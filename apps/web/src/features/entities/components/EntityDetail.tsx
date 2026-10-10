import { getEntityViews, getEntityArchetype, getEntityKind } from '../registry';
import type { EntityDetailProps } from '../types';

export default function EntityDetail(props: EntityDetailProps) {
  const archetype = getEntityArchetype(props.entity);
  const kind = getEntityKind(props.entity);
  const Detail = getEntityViews(archetype, kind).Detail;
  return <Detail {...props} />;
}
