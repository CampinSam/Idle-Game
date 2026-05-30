import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { getRegionDisplay, OUTPOST_REGIONS } from '@derp/shared';
import { getLocationViews } from '../registry';
import { ListControls } from '../../../components/ui';

const STATUS_OPTIONS = [
  { key: 'ALL', label: 'All' },
  { key: 'ACTIVE', label: 'Active' },
  { key: 'INACTIVE', label: 'Inactive' },
];

const REGION_OPTIONS = [
  { key: 'ALL', label: 'All Regions' },
  ...OUTPOST_REGIONS.map((r) => ({ key: r, label: getRegionDisplay(r).displayName })),
];

const LEVEL_THRESHOLDS = [20, 40, 60, 80] as const;
const HARD_CAP = 7;

type OutpostStatus = 'ALL' | 'ACTIVE' | 'INACTIVE';

interface OutpostListProps {
  locations: any[];
  primaryLocationId: string | null;
  activeCount: number;
  slotBudget: number;
  keeperLevel: number;
  bonusSlots: number;
}

function EmptySlotCard() {
  return (
    <div className="bg-bg-card border border-dashed border-border rounded-xl p-4 flex flex-col items-center gap-2 text-center min-h-[140px] justify-center">
      <div className="text-2xl opacity-30">🔒</div>
      <div className="text-[10px] font-extrabold tracking-[0.8px] text-text-secondary">VACANT SLOT</div>
      <button
        type="button"
        disabled
        title="Unlock additional outpost slots through gameplay progression"
        className="mt-1 bg-bg-secondary border border-border text-text-secondary px-3 py-1.5 text-[10px] font-bold rounded-md tracking-[0.3px] cursor-not-allowed opacity-50"
      >
        UNLOCK SLOT
      </button>
    </div>
  );
}

function LevelLockedSlotCard({ unlockLevel }: { unlockLevel: number }) {
  return (
    <div
      className="rounded-xl p-4 flex flex-col items-center gap-2 text-center min-h-[140px] justify-center"
      style={{
        background: 'rgba(15,12,40,0.7)',
        border: '1px dashed rgba(139,92,246,0.25)',
      }}
    >
      <div className="text-xl opacity-40">🔐</div>
      <div className="text-[9px] font-black tracking-[1px] text-text-secondary uppercase leading-none">
        Outpost Slot
      </div>
      <div
        className="text-[10px] font-extrabold tracking-[0.3px] leading-snug"
        style={{ color: 'rgba(167,139,250,0.7)' }}
      >
        Unlock at Level {unlockLevel}
      </div>
    </div>
  );
}

function BonusSlotCard({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl p-4 flex flex-col items-center gap-2 text-center min-h-[140px] justify-center w-full cursor-pointer transition-colors duration-150 group"
      style={{
        background: 'rgba(15,12,40,0.7)',
        border: '1px dashed rgba(251,191,36,0.3)',
      }}
    >
      <div className="text-xl opacity-50 group-hover:opacity-80 transition-opacity">⭐</div>
      <div className="text-[9px] font-black tracking-[1px] uppercase leading-none" style={{ color: 'rgba(251,191,36,0.6)' }}>
        Bonus Slot
      </div>
      <div
        className="text-[10px] font-extrabold tracking-[0.3px] leading-snug group-hover:opacity-100 transition-opacity"
        style={{ color: 'rgba(251,191,36,0.7)' }}
      >
        Available in Store
      </div>
    </button>
  );
}

export function OutpostList({
  locations,
  primaryLocationId,
  activeCount,
  slotBudget,
  keeperLevel,
  bonusSlots,
}: OutpostListProps) {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<OutpostStatus>('ALL');
  const [regionFilter, setRegionFilter] = useState('ALL');
  const [inactiveExpanded, setInactiveExpanded] = useState(false);

  const filtered = useMemo(() => {
    let list = locations;

    if (regionFilter !== 'ALL') {
      list = list.filter((l) => (l.regionId || l.region) === regionFilter);
    }

    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter((l) => {
        const name = (l.name || '').toLowerCase();
        const region = getRegionDisplay(l.regionId || l.region).displayName.toLowerCase();
        return name.includes(q) || region.includes(q);
      });
    }

    return list;
  }, [locations, regionFilter, search]);

  const filteredActive = useMemo(
    () => filtered.filter((l) => l.enabled !== false),
    [filtered],
  );
  const filteredInactive = useMemo(
    () => filtered.filter((l) => l.enabled === false),
    [filtered],
  );

  const showingActive = status !== 'INACTIVE';
  const showingInactive = status !== 'ACTIVE';
  const collapseInactive = status === 'ALL';

  const isFiltered = search.trim().length > 0 || regionFilter !== 'ALL';
  const emptySlots = showingActive && !isFiltered ? Math.max(0, slotBudget - activeCount) : 0;

  // Locked-slot cards: shown between active and inactive, only when not filtered
  const { lockedLevelThresholds, purchasableBonusCount } = useMemo(() => {
    if (isFiltered || !showingActive) return { lockedLevelThresholds: [] as number[], purchasableBonusCount: 0 };
    const remaining = Math.max(0, HARD_CAP - slotBudget);
    const levelThresholds = LEVEL_THRESHOLDS.filter((t) => t > keeperLevel).slice(0, remaining);
    const bonusCapacity = Math.max(0, remaining - levelThresholds.length);
    const purchasable = Math.min(Math.max(0, 3 - bonusSlots), bonusCapacity);
    return { lockedLevelThresholds: levelThresholds as number[], purchasableBonusCount: purchasable };
  }, [isFiltered, showingActive, slotBudget, keeperLevel, bonusSlots]);

  const hasLockedSlots = lockedLevelThresholds.length > 0 || purchasableBonusCount > 0;

  const hasContent =
    (showingActive && (filteredActive.length > 0 || emptySlots > 0 || hasLockedSlots)) ||
    (showingInactive && filteredInactive.length > 0);

  return (
    <div className="flex flex-col gap-3">
      <ListControls
        className="px-3.5 py-2.5 bg-[rgba(26,22,64,0.97)] border-b border-[rgba(139,92,246,0.12)] shrink-0 sticky top-0 z-10"
        search={{ value: search, onChange: setSearch, placeholder: 'Search outposts...' }}
        selects={[
          {
            label: 'Filter by status',
            value: status,
            onChange: (v) => { setStatus(v as OutpostStatus); setInactiveExpanded(false); },
            options: STATUS_OPTIONS,
            width: 96,
          },
          {
            label: 'Filter by region',
            value: regionFilter,
            onChange: setRegionFilter,
            options: REGION_OPTIONS,
            width: 108,
          },
        ]}
      />

      {!hasContent && (
        <div className="text-center py-6 text-text-secondary text-sm">
          No outposts match your filters.
        </div>
      )}

      {showingActive && (filteredActive.length > 0 || emptySlots > 0 || hasLockedSlots) && (
        <div className="flex flex-col gap-2">
          {status === 'ALL' && (
            <div className="text-[10px] font-black tracking-[1px] text-text-secondary uppercase">
              Active
              <span className="ml-1.5 font-semibold normal-case tracking-normal">
                ({filteredActive.length})
              </span>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            {filteredActive.map((op) => {
              const { Card } = getLocationViews(op.kind || op.region, op.isUnique, op.definitionId);
              const isPrimary = op.id === primaryLocationId;
              return (
                <Card
                  key={op.id}
                  outpost={op}
                  isPrimary={isPrimary}
                  onClick={() => navigate(`/locations/${op.id}`)}
                />
              );
            })}
            {Array.from({ length: emptySlots }).map((_, i) => (
              <EmptySlotCard key={`empty-${i}`} />
            ))}
          </div>
        </div>
      )}

      {hasLockedSlots && (
        <div className="flex flex-col gap-2">
          <div className="text-[10px] font-black tracking-[1px] uppercase" style={{ color: 'rgba(139,92,246,0.5)' }}>
            Locked Slots
          </div>
          <div className="grid grid-cols-2 gap-3">
            {lockedLevelThresholds.map((lvl) => (
              <LevelLockedSlotCard key={`level-${lvl}`} unlockLevel={lvl} />
            ))}
            {Array.from({ length: purchasableBonusCount }).map((_, i) => (
              <BonusSlotCard key={`bonus-${i}`} onClick={() => navigate('/store')} />
            ))}
          </div>
        </div>
      )}

      {showingInactive && filteredInactive.length > 0 && (
        <div className="flex flex-col gap-2">
          {collapseInactive ? (
            <button
              type="button"
              onClick={() => setInactiveExpanded((v) => !v)}
              className="flex items-center justify-between w-full bg-transparent border-0 p-0 cursor-pointer group"
            >
              <div className="text-[10px] font-black tracking-[1px] text-text-secondary uppercase group-hover:text-text-primary transition-colors">
                Inactive
                <span className="ml-1.5 font-semibold normal-case tracking-normal">
                  ({filteredInactive.length})
                </span>
              </div>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`text-text-secondary transition-transform duration-200 ${inactiveExpanded ? 'rotate-180' : ''}`}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
          ) : (
            <div className="text-[10px] font-black tracking-[1px] text-text-secondary uppercase">
              Inactive
              <span className="ml-1.5 font-semibold normal-case tracking-normal">
                ({filteredInactive.length})
              </span>
            </div>
          )}

          {(!collapseInactive || inactiveExpanded) && (
            <div className="grid grid-cols-2 gap-3">
              {filteredInactive.map((op) => {
                const { Card } = getLocationViews(op.kind || op.region, op.isUnique, op.definitionId);
                return (
                  <Card
                    key={op.id}
                    outpost={op}
                    isInactive
                    onClick={() => navigate(`/locations/${op.id}`)}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
