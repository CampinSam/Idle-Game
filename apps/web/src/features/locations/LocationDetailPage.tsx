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
      <div className="flex flex-col flex-1 min-h-0 pt-page-top">
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
    <div className="flex flex-col flex-1 min-h-0 pt-page-top">
      <div className="flex flex-col min-h-0 max-h-full overflow-x-hidden overflow-y-auto overscroll-contain bg-gradient-to-b from-[#1a1350] to-[#13103a] border border-border rounded-2xl pb-4">
        <nav className="flex items-center gap-2 px-3.5 py-2.5 text-xs text-text-secondary bg-white/[0.02] border-b border-border" aria-label="Breadcrumb">
          <button
            type="button"
            className="bg-transparent border-0 text-derp-purple text-xs font-semibold px-1 py-0.5 cursor-pointer hover:text-text-primary"
            onClick={() => navigate('/locations')}
            aria-label="Back to locations"
          >
            ← Locations
          </button>
          <span className="text-white/25">/</span>
          <span className="text-text-primary font-semibold overflow-hidden text-ellipsis whitespace-nowrap min-w-0">{outpost.name || 'Location'}</span>
        </nav>
        <Page outpost={outpost} />
      </div>
    </div>
  );
}
