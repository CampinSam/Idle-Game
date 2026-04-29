import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../services/api';
import './CraftingRedirect.css';

type WorkshopRow = {
  buildingId: string;
  buildingDefId: string;
  name: string;
  level: number;
  enabled: boolean;
  locationId: string;
  locationName?: string;
};

export default function CraftingRedirect() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const material = searchParams.get('material');
  const suffix = useMemo(() => (material ? `?material=${encodeURIComponent(material)}` : ''), [material]);
  const [workshops, setWorkshops] = useState<WorkshopRow[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api
      .getCraftingWorkshops()
      .then((list: any) => {
        if (cancelled) return;
        const rows: WorkshopRow[] = Array.isArray(list) ? list : [];
        const enabled = rows.filter((w) => w.enabled !== false);

        // Zero forges → bounce home with the missing-forge banner trigger.
        if (enabled.length === 0) {
          navigate('/?missingForge=1', { replace: true });
          return;
        }

        // Single forge → straight redirect to the only outpost that has one.
        if (enabled.length === 1) {
          navigate(`/locations/${enabled[0].locationId}/workshop${suffix}`, { replace: true });
          return;
        }

        // Multiple forges → present an outpost selector so the player can
        // pick which Forge to enter (the spec calls for an explicit selector
        // when more than one workshop exists).
        setWorkshops(enabled);
      })
      .catch((e: any) => {
        if (!cancelled) setError(e?.message || 'Failed to find Forge');
      });
    return () => {
      cancelled = true;
    };
  }, [navigate, suffix]);

  if (workshops && workshops.length > 0) {
    return (
      <div className="crafting-redirect-picker" role="dialog" aria-label="Choose a Forge">
        <h1 className="crafting-redirect-title">Choose a Forge</h1>
        <p className="crafting-redirect-sub">You have multiple Workshops. Pick one to enter.</p>
        <div className="crafting-redirect-grid">
          {workshops.map((w) => (
            <button
              key={w.buildingId}
              className="crafting-redirect-card"
              onClick={() => navigate(`/locations/${w.locationId}/workshop${suffix}`)}
            >
              <div className="crafting-redirect-card-name">{w.locationName || w.locationId}</div>
              <div className="crafting-redirect-card-meta">
                <span>{w.name}</span>
                <span>Lvl {w.level}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="forge-loading" role="status" aria-live="polite">
      <div className="forge-loading-spinner" />
      <div>{error || 'Routing to your Forge…'}</div>
    </div>
  );
}
