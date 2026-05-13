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
      <div className="relative [background:radial-gradient(circle_at_50%_0%,rgba(244,114,182,0.18),transparent_65%)]">
        <DefaultEntityDetail {...props} />
      </div>
    );
  }

  if (!nft) {
    return <DefaultEntityDetail {...props} />;
  }

  return (
    <div className="relative">
      <DefaultEntityDetail {...props} />
    </div>
  );
}
