import DefaultEntityDetail from '../_default/DefaultEntityDetail';
import type { EntityDetailProps } from '../../types';
import './CyborgEntityDetail.css';

/**
 * Bespoke detail panel for Cyborg-archetype entities.
 *
 * Wraps DefaultEntityDetail in a `.entity-detail--cyborg` container so the
 * shared layout/markup is reused while a thin "SYSTEM ONLINE" status banner
 * + cyan holo accent on the hero are layered on via CSS scoped to that
 * wrapper class. Lightweight variant flows through unchanged.
 */
export default function CyborgEntityDetail(props: EntityDetailProps) {
  if (props.variant === 'lightweight') {
    return <DefaultEntityDetail {...props} />;
  }

  return (
    <div className="entity-detail--cyborg">
      <div className="entity-detail--cyborg__banner">
        <span className="entity-detail--cyborg__banner-dot" aria-hidden />
        SYSTEM ONLINE · CYBORG UNIT
      </div>
      <DefaultEntityDetail {...props} />
    </div>
  );
}
