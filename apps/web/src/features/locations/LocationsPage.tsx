import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useSyncLocations,
  useSyncStatus,
  useSyncPlayer,
} from '../../hooks/useSyncSelectors';
import { useCommand } from '../../hooks/useCommand';
import { getLocationViews } from './registry';
import { ANTI_WHALE_CAPS, getRegionDisplay, OUTPOST_REGIONS } from '@derp/shared';

const PAGE_CLASS =
  'flex flex-col flex-1 min-h-0 overflow-x-hidden overflow-y-auto ' +
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

interface DeactivateTarget {
  id: string;
  name: string;
}

interface OutpostListControlsProps {
  search: string;
  onSearchChange: (v: string) => void;
  regionFilter: string;
  onRegionFilterChange: (v: string) => void;
}

function OutpostListControls({
  search,
  onSearchChange,
  regionFilter,
  onRegionFilterChange,
}: OutpostListControlsProps) {
  return (
    <div className="item-list__controls">
      <div className="item-list__search-wrap">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-secondary)', flexShrink: 0 }}>
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="text"
          placeholder="Search outposts..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="item-list__search-input"
        />
      </div>
      <select
        className="item-list__select"
        style={{ width: 116 }}
        value={regionFilter}
        onChange={(e) => onRegionFilterChange(e.target.value)}
        aria-label="Filter by region"
      >
        <option value="ALL">All Regions</option>
        {OUTPOST_REGIONS.map((r) => (
          <option key={r} value={r}>{getRegionDisplay(r).displayName}</option>
        ))}
      </select>
    </div>
  );
}

function EmptySlotCard() {
  return (
    <div className="bg-bg-card border border-dashed border-border rounded-xl p-4 flex flex-col items-center gap-2 text-center min-h-[140px] justify-center">
      <div className="text-2xl opacity-30">🔒</div>
      <div className="text-[10px] font-extrabold tracking-[0.8px] text-text-secondary">VACANT SLOT</div>
    </div>
  );
}

interface DeactivateModalProps {
  target: DeactivateTarget;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading: boolean;
}

function DeactivateModal({ target, onConfirm, onCancel, isLoading }: DeactivateModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative z-10 w-full max-w-sm mx-4 mb-6 sm:mb-0 bg-gradient-to-b from-[#1e1850] to-[#151030] border-2 border-[rgba(239,68,68,0.4)] rounded-2xl p-5 flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <span className="text-2xl flex-shrink-0">⚠️</span>
          <div>
            <h3 className="font-cinzel text-base font-black text-text-primary mb-1">
              Deactivate Outpost?
            </h3>
            <p className="text-[12px] text-text-secondary leading-relaxed">
              <strong className="text-text-primary">{target.name}</strong> will be deactivated.
            </p>
          </div>
        </div>

        <div className="bg-[rgba(239,68,68,0.08)] border border-[rgba(239,68,68,0.25)] rounded-xl p-3 flex flex-col gap-1.5">
          <div className="text-[11px] font-bold text-[#f87171] tracking-[0.3px] mb-0.5">THIS WILL IMMEDIATELY:</div>
          <div className="flex items-center gap-2 text-[11px] text-text-secondary">
            <span className="text-[#f87171]">•</span>
            Unassign all workers from this outpost
          </div>
          <div className="flex items-center gap-2 text-[11px] text-text-secondary">
            <span className="text-[#f87171]">•</span>
            Cancel all active jobs for every team member
          </div>
          <div className="flex items-center gap-2 text-[11px] text-text-secondary">
            <span className="text-[#f87171]">•</span>
            Archive related notifications
          </div>
        </div>

        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="flex-1 py-2.5 rounded-xl border border-border text-text-secondary text-[12px] font-bold tracking-[0.3px] bg-transparent hover:border-[rgba(139,92,246,0.4)] hover:text-text-primary transition-colors cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className="flex-1 py-2.5 rounded-xl border border-[rgba(239,68,68,0.5)] text-[#f87171] text-[12px] font-bold tracking-[0.3px] bg-[rgba(239,68,68,0.12)] hover:bg-[rgba(239,68,68,0.2)] transition-colors cursor-pointer disabled:opacity-50"
          >
            {isLoading ? 'Deactivating…' : 'Deactivate'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function LocationsPage() {
  const navigate = useNavigate();
  const allLocations = useSyncLocations();
  const syncStatus = useSyncStatus();
  const player = useSyncPlayer();
  const { execute } = useCommand();

  const [inactiveExpanded, setInactiveExpanded] = useState(false);
  const [search, setSearch] = useState('');
  const [regionFilter, setRegionFilter] = useState('ALL');
  const [deactivateTarget, setDeactivateTarget] = useState<DeactivateTarget | null>(null);
  const [deactivating, setDeactivating] = useState(false);

  if (syncStatus === 'disconnected') return <LocationsPageSkeleton />;

  const keeperLevel: number = player?.keeperLevel ?? 1;
  const bonusSlots: number = player?.bonusOutpostSlots ?? 0;
  const primaryLocationId: string | null = player?.primaryLocationId ?? null;
  const slotBudget = ANTI_WHALE_CAPS.maxActiveOutposts(keeperLevel, bonusSlots);

  const activeLocations = useMemo(
    () => (allLocations as any[]).filter((l) => l.enabled !== false),
    [allLocations],
  );
  const inactiveLocations = useMemo(
    () => (allLocations as any[]).filter((l) => l.enabled === false),
    [allLocations],
  );

  const primaryOutpost = activeLocations.find((l) => l.id === primaryLocationId) ?? activeLocations[0] ?? null;
  const secondaryActive = activeLocations.filter((l) => l.id !== primaryOutpost?.id);
  const emptySlots = Math.max(0, slotBudget - activeLocations.length);

  const filteredInactive = useMemo(() => {
    let list = inactiveLocations;
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter((l: any) => {
        const name = (l.name || '').toLowerCase();
        const region = getRegionDisplay(l.regionId || l.region).displayName.toLowerCase();
        return name.includes(q) || region.includes(q);
      });
    }
    if (regionFilter !== 'ALL') {
      list = list.filter((l: any) => (l.regionId || l.region) === regionFilter);
    }
    return list;
  }, [inactiveLocations, search, regionFilter]);

  const handleSetPrimary = async (locationId: string) => {
    try {
      await execute('SetPrimaryOutpost', { locationId });
    } catch (err: any) {
      console.error('[LocationsPage] SetPrimaryOutpost failed:', err);
    }
  };

  const handleDeactivateRequest = (outpost: any) => {
    const regionName = getRegionDisplay(outpost.regionId || outpost.region).displayName;
    setDeactivateTarget({ id: outpost.id, name: outpost.name || regionName });
  };

  const handleDeactivateConfirm = async () => {
    if (!deactivateTarget) return;
    setDeactivating(true);
    try {
      await execute('ToggleLocation', { locationId: deactivateTarget.id, enabled: false });
      setDeactivateTarget(null);
    } catch (err: any) {
      console.error('[LocationsPage] ToggleLocation failed:', err);
    } finally {
      setDeactivating(false);
    }
  };

  return (
    <div className={PAGE_CLASS}>
      <div className="px-4 pt-4 pb-6 flex flex-col gap-4">

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-black tracking-[0.8px] text-text-secondary uppercase">Outpost Slots</span>
            <span
              className="text-[11px] font-black tracking-[0.5px] px-2.5 py-[3px] rounded-full"
              style={{
                background: activeLocations.length >= slotBudget
                  ? 'rgba(239,68,68,0.15)'
                  : 'rgba(139,92,246,0.15)',
                border: `1px solid ${activeLocations.length >= slotBudget ? 'rgba(239,68,68,0.4)' : 'rgba(139,92,246,0.4)'}`,
                color: activeLocations.length >= slotBudget ? '#f87171' : '#c4b5fd',
              }}
            >
              {activeLocations.length} / {slotBudget}
            </span>
          </div>
          {bonusSlots > 0 && (
            <span className="text-[10px] text-[#a78bfa] font-bold tracking-[0.3px]">
              +{bonusSlots} bonus {bonusSlots === 1 ? 'slot' : 'slots'}
            </span>
          )}
        </div>

        {primaryOutpost && (() => {
          const { Card } = getLocationViews(primaryOutpost.kind || primaryOutpost.region, primaryOutpost.isUnique, primaryOutpost.definitionId);
          return (
            <div className="flex flex-col gap-2">
              <div className="text-[10px] font-black tracking-[1px] text-[#a78bfa] uppercase">★ Primary Outpost</div>
              <div className="flex">
                <Card
                  outpost={primaryOutpost}
                  isPrimary
                  onDeactivate={() => handleDeactivateRequest(primaryOutpost)}
                  onClick={() => navigate(`/locations/${primaryOutpost.id}`)}
                />
              </div>
            </div>
          );
        })()}

        {(secondaryActive.length > 0 || emptySlots > 0) && (
          <div className="flex flex-col gap-2">
            <div className="text-[10px] font-black tracking-[1px] text-text-secondary uppercase">
              Active Outposts
              {secondaryActive.length > 0 && (
                <span className="ml-2 font-semibold normal-case tracking-normal text-[10px]">
                  ({secondaryActive.length})
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {secondaryActive.map((op: any) => {
                const { Card } = getLocationViews(op.kind || op.region, op.isUnique, op.definitionId);
                return (
                  <Card
                    key={op.id}
                    outpost={op}
                    isPrimary={false}
                    onSetPrimary={() => handleSetPrimary(op.id)}
                    onDeactivate={() => handleDeactivateRequest(op)}
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

        {activeLocations.length === 0 && (
          <div className="text-center py-8 text-text-secondary text-sm">
            <div className="text-3xl mb-3 opacity-40">🏚️</div>
            No active outposts. Activate one below to get started.
          </div>
        )}

        {inactiveLocations.length > 0 && (
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setInactiveExpanded((v) => !v)}
              className="flex items-center justify-between w-full bg-transparent border-0 p-0 cursor-pointer group"
            >
              <div className="text-[10px] font-black tracking-[1px] text-text-secondary uppercase group-hover:text-text-primary transition-colors">
                Inactive Outposts
                <span className="ml-2 font-semibold normal-case tracking-normal text-[10px]">
                  ({inactiveLocations.length})
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

            {inactiveExpanded && (
              <div className="flex flex-col gap-3">
                <OutpostListControls
                  search={search}
                  onSearchChange={setSearch}
                  regionFilter={regionFilter}
                  onRegionFilterChange={setRegionFilter}
                />
                {filteredInactive.length === 0 ? (
                  <div className="text-center py-6 text-text-secondary text-sm">
                    No outposts match your filters.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {filteredInactive.map((op: any) => {
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
        )}
      </div>

      {deactivateTarget && (
        <DeactivateModal
          target={deactivateTarget}
          onConfirm={handleDeactivateConfirm}
          onCancel={() => setDeactivateTarget(null)}
          isLoading={deactivating}
        />
      )}
    </div>
  );
}
