import DefaultEntityCard from '../_default/DefaultEntityCard';
import type { EntityCardProps } from '../../types';
import './CyborgEntityCard.css';

/**
 * Bespoke card for Cyborg-archetype entities.
 *
 * Composes the DefaultEntityCard via className, then layers a holographic
 * scanline + circuit-corner treatment through CSS pseudo-elements so the
 * special look applies cleanly to every useCase (browse, mission, picker,
 * crafting, outpost) without re-implementing markup.
 */
export default function CyborgEntityCard(props: EntityCardProps) {
  return (
    <DefaultEntityCard
      {...props}
      className={['entity-card--cyborg', props.className].filter(Boolean).join(' ')}
    />
  );
}
