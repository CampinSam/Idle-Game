import { useParams, useNavigate } from 'react-router-dom';
import { useSyncLocations } from '../../hooks/useSyncSelectors';
import { getLocationViews } from './registry';

export default function LocationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const locations = useSyncLocations();

  const outpost = locations.find((op: any) => op.id === id);

  if (!outpost) {
    return (
      <div className="outpost-detail-page">
        <div className="od-loading">Loading outpost...</div>
      </div>
    );
  }

  const { Page } = getLocationViews(
    outpost.kind || outpost.region,
    !!outpost.isUnique,
    outpost.definitionId,
  );

  return (
    <div className="outpost-detail-page">
      <div className="od-container">
        <nav className="od-breadcrumb" aria-label="Breadcrumb">
          <button
            type="button"
            className="od-breadcrumb-back"
            onClick={() => navigate('/locations')}
            aria-label="Back to locations"
          >
            ← Locations
          </button>
          <span className="od-breadcrumb-sep">/</span>
          <span className="od-breadcrumb-current">{outpost.name || 'Location'}</span>
        </nav>
        <Page outpost={outpost} />
      </div>
    </div>
  );
}
