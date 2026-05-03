import DefaultEntityDetail from '../_default/DefaultEntityDetail';
import type { EntityDetailProps } from '../../types';
import { isPerfectSpecimen, getPerfectSpecimenTrait } from './isPerfectSpecimen';
import { isNftEntity } from './isNftEntity';
import './DerpBirdEntityDetail.css';
import './PerfectSpecimenDetail.css';

export default function DerpBirdEntityDetail(props: EntityDetailProps) {
  if (props.variant === 'lightweight') {
    return <DefaultEntityDetail {...props} />;
  }

  const perfect = isPerfectSpecimen(props.entity);
  const trait = getPerfectSpecimenTrait(props.entity);
  const nft = isNftEntity(props.entity);

  const portraitBadge = perfect ? (
    <div className="entity-detail__perfect-badge">
      <span className="entity-detail__perfect-badge-star">★</span>
      PERFECT
      {trait && <span className="entity-detail__perfect-badge-trait"> · {trait.toUpperCase()}</span>}
    </div>
  ) : undefined;

  if (perfect) {
    return (
      <div className="entity-detail--derp-bird-perfect">
        <DefaultEntityDetail {...props} portraitBadge={portraitBadge} />
      </div>
    );
  }

  if (!nft) {
    return <DefaultEntityDetail {...props} />;
  }

  return (
    <div className="entity-detail--derp-bird">
      <DefaultEntityDetail {...props} />
    </div>
  );
}
