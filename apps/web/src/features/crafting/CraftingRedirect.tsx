import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../services/api';

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

        if (enabled.length === 0) {
          navigate('/?missingForge=1', { replace: true });
          return;
        }

        if (enabled.length === 1) {
          navigate(`/locations/${enabled[0].locationId}/workshop${suffix}`, { replace: true });
          return;
        }

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
      <div className="max-w-[720px] mx-auto my-16 px-5 py-8 text-slate-200" role="dialog" aria-label="Choose a Forge">
        <h1 className="text-2xl font-bold m-0 mb-2 text-center">Choose a Forge</h1>
        <p className="m-0 mb-6 text-center text-slate-400">You have multiple Workshops. Pick one to enter.</p>
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
          {workshops.map((w) => (
            <button
              key={w.buildingId}
              onClick={() => navigate(`/locations/${w.locationId}/workshop${suffix}`)}
              className="flex flex-col gap-1.5 p-4 border rounded-xl text-left cursor-pointer transition-[transform,border-color] duration-75 hover:-translate-y-px hover:border-[rgba(139,92,246,0.85)] focus-visible:outline-none focus-visible:-translate-y-px focus-visible:border-[rgba(139,92,246,0.85)]"
              style={{
                background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.12), rgba(34, 24, 88, 0.6))',
                borderColor: 'rgba(139, 92, 246, 0.45)',
                color: 'inherit',
              }}
            >
              <div className="text-base font-semibold">{w.locationName || w.locationId}</div>
              <div className="flex justify-between text-[0.8rem] text-slate-400">
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
    <div
      className="flex items-center justify-center h-[60vh] text-[#fed7aa] text-sm tracking-[0.18em] uppercase font-bold"
      role="status"
      aria-live="polite"
    >
      <div>{error || 'Routing to your Forge…'}</div>
    </div>
  );
}
