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

  if (perfect) {
    return (
      <div className="entity-detail--derp-bird-perfect">
        <div className="entity-detail--derp-bird-perfect__banner">
          <span className="entity-detail--derp-bird-perfect__star" aria-hidden>★</span>
          PERFECT SPECIMEN
          {trait && (
            <span className="entity-detail--derp-bird-perfect__trait">
              · ALL {trait.toUpperCase()}
            </span>
          )}
          <span className="entity-detail--derp-bird-perfect__star" aria-hidden>★</span>
        </div>
        <DefaultEntityDetail {...props} />
      </div>
    );
  }

  if (!nft) {
    return <DefaultEntityDetail {...props} />;
  }

  return (
    <div className="entity-detail--derp-bird">
      <div className="entity-detail--derp-bird__banner">
        <span className="entity-detail--derp-bird__chip">NFT</span>
        DERP BIRD COLLECTION
      </div>
      <DefaultEntityDetail {...props} />
    </div>
  );
}
