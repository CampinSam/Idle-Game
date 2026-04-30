import { getEntityViews, getEntityArchetype, getEntityKind } from '../registry';
import type { EntityCardProps } from '../types';

export default function EntityCard(props: EntityCardProps) {
  const archetype = getEntityArchetype(props.entity);
  const kind = getEntityKind(props.entity);
  const Card = getEntityViews(archetype, kind).Card;
  return <Card {...props} />;
}
