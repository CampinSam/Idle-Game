import DefaultEntityCard from '../_default/DefaultEntityCard';
import type { EntityCardProps } from '../../types';
import { isPerfectSpecimen } from './isPerfectSpecimen';
import { isNftEntity } from './isNftEntity';

export default function DerpBirdEntityCard(props: EntityCardProps) {
  const perfect = isPerfectSpecimen(props.entity);
  const nft = isNftEntity(props.entity);

  const classes = perfect
    ? ['entity-card--derp-bird-perfect']
    : ['entity-card--derp-bird', nft && 'entity-card--derp-bird-nft'];

  return (
    <DefaultEntityCard
      {...props}
      className={[...classes, props.className].filter(Boolean).join(' ')}
    />
  );
}
