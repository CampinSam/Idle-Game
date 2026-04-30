import { getEntityViews, getEntityArchetype } from '../registry';
import type { EntityCardProps } from '../types';

export default function EntityCard(props: EntityCardProps) {
  const archetype = getEntityArchetype(props.entity);
  const Card = getEntityViews(archetype, props.entity?.kind).Card;
  return <Card {...props} />;
}
