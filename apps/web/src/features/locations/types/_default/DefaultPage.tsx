import { useNavigate } from 'react-router-dom';
import { getRegionDisplay } from '@derp/shared';
import { formatAmount } from '../../../../utils/locationProduction';
import { Badge, OutpostCard, OutpostCardTitle } from '../../../../components/ui';
import type { LocationPageProps } from '../../registry';

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
    <div className="flex flex-col gap-3.5 px-3">
      <OutpostCard accent="header" className="!p-0">
        {regionImage && (
          <div className="relative overflow-hidden rounded-t-xl">
            <img src={regionImage} alt={regionName} className="block w-full h-40 object-cover" />
          </div>
        )}
        <div className="flex flex-col gap-1.5 px-3.5 py-3">
          <h1 className="font-cinzel text-[20px] font-black tracking-[0.04em] leading-tight text-[#f5f3ff] m-0">
            {outpost.name || 'Location'}
            {regionName && (
              <span className="block mt-1 font-sans text-[11px] font-semibold tracking-[0.12em] uppercase text-[rgba(196,181,253,0.75)]">
                &bull; {regionName}
              </span>
            )}
          </h1>
          <div className="flex flex-wrap gap-1.5 mt-1">
            <Badge tone="info">Level {outpost.level ?? 1}</Badge>
            {(outpost as any).definitionId && (
              <Badge tone="neutral">{(outpost as any).definitionId}</Badge>
            )}
          </div>
        </div>
      </OutpostCard>

      {storageEntries.length > 0 && (
        <OutpostCard accent="warehouse">
          <OutpostCardTitle accent="warehouse">STORAGE</OutpostCardTitle>
          <div className="flex flex-col gap-2.5">
            {storageEntries.map((res) => {
              const pct = res.capacity > 0 ? Math.min((res.current / res.capacity) * 100, 100) : 0;
              return (
                <div
                  key={res.resId}
                  className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg bg-white/[0.025] border border-white/[0.05]"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-semibold text-[#f1f5f9] mb-1.5 truncate">
                      {res.resId.replace(/^(soft_|mat_)/, '').replace(/_/g, ' ')}
                    </div>
                    <div className="h-1.5 rounded-full bg-black/45 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[#fbbf24] to-[#f59e0b] shadow-[0_0_8px_rgba(245,158,11,0.3)] transition-[width] duration-[400ms]"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                  <span className="text-[11px] font-bold text-[#fcd34d] whitespace-nowrap">
                    {formatAmount(res.current)} / {formatAmount(res.capacity)}
                  </span>
                </div>
              );
            })}
          </div>
        </OutpostCard>
      )}

      <OutpostCard>
        <button
          onClick={() => navigate('/locations')}
          className="w-full px-5 py-2.5 rounded-xl text-white text-[13px] font-extrabold tracking-[0.06em] uppercase border border-[rgba(52,211,153,0.35)] cursor-pointer hover:brightness-110"
          style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
        >
          Back to Locations
        </button>
      </OutpostCard>
    </div>
  );
}
