import { useParams } from 'react-router-dom';
import { useSyncLocations } from '../../hooks/useSyncSelectors';
import { getLocationViews } from './registry';

export default function LocationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const locations = useSyncLocations();

  const outpost = locations.find((op: any) => op.id === id);

  if (!outpost) {
    return (
      <div className="flex flex-col flex-1 min-h-0">
        <div className="text-center py-[60px] px-5 text-text-secondary text-[15px]">Loading outpost...</div>
      </div>
    );
  }

  const { Page } = getLocationViews(
    outpost.kind || outpost.region,
    !!outpost.isUnique,
    outpost.definitionId,
  );

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex flex-col flex-1 min-h-0 overflow-x-hidden overflow-y-auto [-webkit-overflow-scrolling:touch] overscroll-contain">
        <Page outpost={outpost} />
      </div>
    </div>
  );
}
