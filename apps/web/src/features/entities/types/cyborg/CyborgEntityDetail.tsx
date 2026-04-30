import DefaultEntityDetail from '../_default/DefaultEntityDetail';
import type { EntityDetailProps } from '../../types';
import './CyborgEntityDetail.css';

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
