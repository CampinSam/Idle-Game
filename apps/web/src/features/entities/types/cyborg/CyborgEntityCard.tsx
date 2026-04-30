import DefaultEntityCard from '../_default/DefaultEntityCard';
import type { EntityCardProps } from '../../types';
import './CyborgEntityCard.css';

export default function CyborgEntityCard(props: EntityCardProps) {
  return (
    <DefaultEntityCard
      {...props}
      className={['entity-card--cyborg', props.className].filter(Boolean).join(' ')}
    />
  );
}
