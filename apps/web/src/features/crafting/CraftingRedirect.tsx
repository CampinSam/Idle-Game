import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../services/api';

export default function CraftingRedirect() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const material = searchParams.get('material');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api
      .getCraftingWorkshops()
      .then((list: any) => {
        if (cancelled) return;
        const workshops = Array.isArray(list) ? list : [];
        const target = workshops.find((w: any) => w.enabled) ?? workshops[0] ?? null;
        if (target) {
          const suffix = material ? `?material=${encodeURIComponent(material)}` : '';
          navigate(`/locations/${target.locationId}/workshop${suffix}`, { replace: true });
        } else {
          navigate('/?missingForge=1', { replace: true });
        }
      })
      .catch((e: any) => {
        if (!cancelled) setError(e?.message || 'Failed to find Forge');
      });
    return () => {
      cancelled = true;
    };
  }, [navigate, material]);

  return (
    <div className="forge-loading" role="status" aria-live="polite">
      <div className="forge-loading-spinner" />
      <div>{error || 'Routing to your Forge…'}</div>
    </div>
  );
}
