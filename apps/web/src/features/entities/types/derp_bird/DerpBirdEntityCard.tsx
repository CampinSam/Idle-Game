import DefaultEntityCard from '../_default/DefaultEntityCard';
import type { EntityCardProps } from '../../types';
import { isPerfectSpecimen } from './isPerfectSpecimen';
import './DerpBirdEntityCard.css';
import './PerfectSpecimenCard.css';

export default function DerpBirdEntityCard(props: EntityCardProps) {
  const perfect = isPerfectSpecimen(props.entity);
  const modifier = perfect ? 'entity-card--derp-bird-perfect' : 'entity-card--derp-bird';
  return (
    <DefaultEntityCard
      {...props}
      className={[modifier, props.className].filter(Boolean).join(' ')}
    />
  );
}
