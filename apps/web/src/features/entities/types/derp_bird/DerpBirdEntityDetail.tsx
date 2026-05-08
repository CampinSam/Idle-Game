import DefaultEntityDetail from '../_default/DefaultEntityDetail';
import type { EntityDetailProps } from '../../types';
import { isPerfectSpecimen } from './isPerfectSpecimen';
import { isNftEntity } from './isNftEntity';

export default function DerpBirdEntityDetail(props: EntityDetailProps) {
  if (props.variant === 'lightweight') {
    return <DefaultEntityDetail {...props} />;
  }

  const perfect = isPerfectSpecimen(props.entity);
  const nft = isNftEntity(props.entity);

  if (perfect) {
    return (
      <div className="entity-detail--derp-bird-perfect">
        <DefaultEntityDetail {...props} />
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
