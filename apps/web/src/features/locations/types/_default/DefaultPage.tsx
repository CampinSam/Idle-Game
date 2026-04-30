import { useNavigate } from 'react-router-dom';
import { getRegionDisplay } from '@derp/shared';
import { formatAmount } from '../../../../utils/locationProduction';
import type { LocationPageProps } from '../../registry';
import './DefaultPage.css';

export default function DefaultPage({ outpost }: LocationPageProps) {
  const navigate = useNavigate();
  const regionDisplay = getRegionDisplay(outpost.regionId || outpost.region);
  const regionName = regionDisplay.displayName;
  const regionImage = regionDisplay.imagePath;

  const storage = (outpost as any).storage || {};
  const storedMap = (storage.stored as Record<string, number>) || {};
  const capacityMap = (storage.capacity as Record<string, number>) || {};

  const storageEntries = Object.entries(capacityMap)
    .filter(([, cap]) => Number(cap) > 0)
    .map(([resId, cap]) => ({
      resId,
      current: Number(storedMap[resId] ?? 0),
      capacity: Number(cap),
    }));

  return (
    <div className="od-tab-content od-card-stack">
      <div className="od-card od-card-header">
        {regionImage && (
          <div className="od-hero-image">
            <img src={regionImage} alt={regionName} />
          </div>
        )}
        <div className="od-header-info od-header-info-stacked">
          <h1 className="od-name">
            {outpost.name || 'Location'}
            {regionName && <span className="od-name-region"> &bull; {regionName}</span>}
          </h1>
          <div className="od-badges">
            <span className="od-level-badge">Level {outpost.level ?? 1}</span>
            {(outpost as any).definitionId && (
              <span className="od-level-badge">{(outpost as any).definitionId}</span>
            )}
          </div>
        </div>
      </div>

      {storageEntries.length > 0 && (
        <div className="od-card od-card-warehouse">
          <h3 className="od-card-title">STORAGE</h3>
          <div className="od-storage-list">
            {storageEntries.map((res) => {
              const pct = res.capacity > 0 ? Math.min((res.current / res.capacity) * 100, 100) : 0;
              return (
                <div key={res.resId} className="od-storage-item">
                  <div className="od-storage-info">
                    <div className="od-storage-name">{res.resId.replace(/^(soft_|mat_)/, '').replace(/_/g, ' ')}</div>
                    <div className="od-storage-bar-wrap">
                      <div className="od-storage-bar" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <span className="od-storage-amount">
                    {formatAmount(res.current)} / {formatAmount(res.capacity)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="od-card">
        <button
          className="od-collect-btn"
          onClick={() => navigate('/locations')}
          style={{ width: '100%' }}
        >
          Back to Locations
        </button>
      </div>
    </div>
  );
}
