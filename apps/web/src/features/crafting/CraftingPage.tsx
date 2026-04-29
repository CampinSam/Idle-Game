import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../services/api';
import './CraftingPage.css';

interface Workshop {
  buildingId: string;
  buildingDefId: string;
  name: string;
  level: number;
  enabled: boolean;
  locationId: string;
}

export default function CraftingPage() {
  const navigate = useNavigate();
  const [workshops, setWorkshops] = useState<Workshop[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api.getCraftingWorkshops()
      .then((list) => {
        if (cancelled) return;
        setWorkshops(list);
        const enabled = list.find((w) => w.enabled);
        if (enabled) {
          navigate(`/locations/${enabled.locationId}/workshop`, { replace: true });
        }
      })
      .catch(() => { if (!cancelled) setWorkshops([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [navigate]);

  if (loading) {
    return (
      <div className="crafting-page">
        <h1>Crafting Workshop</h1>
        <p className="page-desc">Looking for your Forge…</p>
      </div>
    );
  }

  const disabled = (workshops ?? []).filter((w) => !w.enabled);

  return (
    <div className="crafting-page">
      <h1>The Forge</h1>
      <p className="page-desc">
        Crafting now lives inside the Workshop building of your Outpost. Build one to start forging gear and brewing potions.
      </p>

      {disabled.length > 0 && (
        <div className="section">
          <h2>Your Workshops are disabled</h2>
          <div className="craft-jobs">
            {disabled.map((w) => (
              <div key={w.buildingId} className="card craft-job-card">
                <div><strong>{w.name}</strong></div>
                <button className="primary" onClick={() => navigate(`/locations/${w.locationId}`)}>
                  Re-enable in Outpost
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="section">
        <button className="primary start-craft-btn" onClick={() => navigate('/locations')}>
          Go to your Outposts →
        </button>
      </div>
    </div>
  );
}
