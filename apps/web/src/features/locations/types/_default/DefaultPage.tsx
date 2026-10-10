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

  const isActive = outpost.enabled !== false;

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
    <div className="flex flex-col flex-1 min-h-0">
      <div className="bg-[rgba(26,22,64,0.97)] border-b border-[rgba(139,92,246,0.12)] sticky top-0 z-10 shrink-0">
        <div className="flex items-center gap-2 px-3 py-2">
          <button
            type="button"
            className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-white/5 border border-[rgba(139,92,246,0.25)] text-text-primary text-xl cursor-pointer transition-colors flex-shrink-0 active:bg-[rgba(139,92,246,0.28)] active:border-[rgba(139,92,246,0.55)]"
            onClick={() => navigate('/locations')}
            aria-label="Back to locations"
          >
            ←
          </button>

          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-bold tracking-wide text-text-primary truncate m-0">
              {(outpost.name || 'Location').toUpperCase()}
            </h1>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              {regionName && (
                <span className="text-xs text-text-secondary truncate">{regionName}</span>
              )}
              {isActive ? (
                <span className="text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded bg-[rgba(34,197,94,0.12)] border border-[rgba(34,197,94,0.35)] text-[#4ade80] flex-shrink-0">
                  Active
                </span>
              ) : (
                <span className="text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded bg-white/5 border border-white/20 text-text-secondary flex-shrink-0">
                  Inactive
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-x-hidden overflow-y-auto touch-pan-y [-webkit-overflow-scrolling:touch] overscroll-contain">
      <div className="flex flex-col gap-3.5 px-3 pt-3.5 pb-6">
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
      </div>
      </div>
    </div>
  );
}
