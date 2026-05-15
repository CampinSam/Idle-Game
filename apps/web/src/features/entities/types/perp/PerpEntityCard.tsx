import DefaultEntityCard from '../_default/DefaultEntityCard';
import type { EntityCardProps } from '../../types';
import { isLeader } from './isLeader';
import { getFaction } from './getFaction';
import { isNftEntity } from '../derp_bird/isNftEntity';

export default function PerpEntityCard(props: EntityCardProps) {
  const leader = isLeader(props.entity);
  const faction = getFaction(props.entity);
  const nft = isNftEntity(props.entity);

  let primaryClass: string;
  if (leader === 'multiverse_leader') {
    primaryClass = 'entity-card--perp-multiverse-leader';
  } else if (leader === 'leader') {
    primaryClass = 'entity-card--perp-leader';
  } else if (faction === 'genovault') {
    primaryClass = 'entity-card--perp entity-card--perp-genovault';
  } else if (faction === 'astro_schism') {
    primaryClass = 'entity-card--perp entity-card--perp-astro-schism';
  } else if (faction === 'kraashers') {
    primaryClass = 'entity-card--perp entity-card--perp-kraashers';
  } else {
    primaryClass = 'entity-card--perp';
  }

  const classes = [primaryClass, nft && 'entity-card--perp-nft'];

  return (
    <DefaultEntityCard
      {...props}
      className={[...classes, props.className].filter(Boolean).join(' ')}
    />
  );
}
