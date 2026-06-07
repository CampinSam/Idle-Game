import { useNavigate } from 'react-router-dom';
import {
  useSyncLocations,
  useSyncStatus,
  useSyncPlayer,
} from '../../hooks/useSyncSelectors';
import { getLocationViews } from './registry';
import { outpostSlotBudget } from '@derp/shared';
import { OutpostList } from './components/OutpostList';

const PAGE_CLASS =
  'flex-1 min-h-0 overflow-x-hidden overflow-y-auto touch-pan-y ' +
  '[-webkit-overflow-scrolling:touch] overscroll-contain';

function LocationsPageSkeleton() {
  return (
    <div className={PAGE_CLASS}>
      <div className="px-4 pt-4 pb-2">
        <div className="skeleton" style={{ width: '40%', height: 28, borderRadius: 20, marginBottom: 16 }} />
        <div className="skeleton" style={{ width: '100%', height: 220, borderRadius: 14, marginBottom: 12 }} />
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 180, borderRadius: 14 }} />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function LocationsContent() {
  const navigate = useNavigate();
  const allLocations = useSyncLocations();
  const syncStatus = useSyncStatus();
  const player = useSyncPlayer();

  if (syncStatus === 'disconnected') return <LocationsPageSkeleton />;

  const keeperLevel: number = player?.keeperLevel ?? 1;
  const bonusSlots: number = player?.bonusOutpostSlots ?? 0;
  const primaryLocationId: string | null = player?.primaryLocationId ?? null;
  const slotBudget = outpostSlotBudget(keeperLevel, bonusSlots);

  const activeLocations = allLocations.filter((l) => l.enabled !== false);
  const activeCount = activeLocations.length;

  const primaryOutpost = activeLocations.find((l) => l.id === primaryLocationId)
    ?? activeLocations[0]
    ?? null;

  const nonPrimaryLocations = primaryOutpost
    ? allLocations.filter((l) => l.id !== primaryOutpost.id)
    : allLocations;

  return (
    <div className={PAGE_CLASS}>
      <div className="px-4 pt-4 pb-6 flex flex-col gap-4">

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-black tracking-[0.8px] text-text-secondary uppercase">Outpost Slots</span>
            <span
              className="text-[11px] font-black tracking-[0.5px] px-2.5 py-[3px] rounded-full"
              style={{
                background: activeCount >= slotBudget
                  ? 'rgba(239,68,68,0.15)'
                  : 'rgba(139,92,246,0.15)',
                border: `1px solid ${activeCount >= slotBudget ? 'rgba(239,68,68,0.4)' : 'rgba(139,92,246,0.4)'}`,
                color: activeCount >= slotBudget ? '#f87171' : '#c4b5fd',
              }}
            >
              {activeCount} / {slotBudget}
            </span>
          </div>
          {bonusSlots > 0 && (
            <span className="text-[10px] text-[#a78bfa] font-bold tracking-[0.3px]">
              +{bonusSlots} bonus {bonusSlots === 1 ? 'slot' : 'slots'}
            </span>
          )}
        </div>

        {primaryOutpost && (() => {
          const { Card } = getLocationViews(
            primaryOutpost.kind || primaryOutpost.region,
            primaryOutpost.isUnique,
            primaryOutpost.definitionId,
          );
          return (
            <div className="flex flex-col gap-2">
              <div className="text-[10px] font-black tracking-[1px] text-[#a78bfa] uppercase">★ Primary Outpost</div>
              <div className="flex">
                <Card
                  outpost={primaryOutpost}
                  isPrimary
                  onClick={() => navigate(`/locations/${primaryOutpost.id}`)}
                />
              </div>
            </div>
          );
        })()}

        {allLocations.length === 0 && (
          <div className="text-center py-8 text-text-secondary text-sm">
            <div className="text-3xl mb-3 opacity-40">🏚️</div>
            No outposts yet.
          </div>
        )}

        {(nonPrimaryLocations.length > 0 || activeCount < slotBudget || keeperLevel < 80 || bonusSlots < 3) && (
          <OutpostList
            locations={nonPrimaryLocations}
            primaryLocationId={primaryLocationId}
            activeCount={activeCount}
            slotBudget={slotBudget}
            keeperLevel={keeperLevel}
            bonusSlots={bonusSlots}
          />
        )}
      </div>
    </div>
  );
}
