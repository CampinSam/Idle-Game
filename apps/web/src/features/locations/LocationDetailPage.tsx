import { useParams } from 'react-router-dom';
import { useSyncLocations } from '../../hooks/useSyncSelectors';
import { getLocationViews } from './registry';
import './LocationDetailPage.css';

export default function LocationDetailPage() {
  const { id } = useParams<{ id: string }>();
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
    outpost.region,
    !!outpost.isUnique,
    outpost.definitionId,
  );

  return (
    <div className="outpost-detail-page">
      <div className="od-container">
        <Page outpost={outpost} />
      </div>
    </div>
  );
}
