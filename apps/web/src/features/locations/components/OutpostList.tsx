import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { getRegionDisplay, OUTPOST_REGIONS } from '@derp/shared';
import { getLocationViews } from '../registry';

type OutpostStatus = 'ALL' | 'ACTIVE' | 'INACTIVE';

interface OutpostListProps {
  locations: any[];
  primaryLocationId: string | null;
  activeCount: number;
  slotBudget: number;
  onSetPrimary: (locationId: string) => void;
  onDeactivate: (outpost: any) => void;
  onActivate: (outpost: any) => void;
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

export function OutpostList({
  locations,
  primaryLocationId,
  activeCount,
  slotBudget,
  onSetPrimary,
  onDeactivate,
  onActivate,
}: OutpostListProps) {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<OutpostStatus>('ALL');
  const [regionFilter, setRegionFilter] = useState('ALL');
  const [inactiveExpanded, setInactiveExpanded] = useState(false);

  const canActivate = activeCount < slotBudget;

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

  const hasContent =
    (showingActive && (filteredActive.length > 0 || emptySlots > 0)) ||
    (showingInactive && filteredInactive.length > 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="item-list__controls">
        <div className="item-list__search-wrap">
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ color: 'var(--text-secondary)', flexShrink: 0 }}
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Search outposts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="item-list__search-input"
          />
        </div>
        <select
          className="item-list__select"
          style={{ width: 96 }}
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as OutpostStatus);
            setInactiveExpanded(false);
          }}
          aria-label="Filter by status"
        >
          <option value="ALL">All</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
        </select>
        <select
          className="item-list__select"
          style={{ width: 108 }}
          value={regionFilter}
          onChange={(e) => setRegionFilter(e.target.value)}
          aria-label="Filter by region"
        >
          <option value="ALL">All Regions</option>
          {OUTPOST_REGIONS.map((r) => (
            <option key={r} value={r}>
              {getRegionDisplay(r).displayName}
            </option>
          ))}
        </select>
      </div>

      {!hasContent && (
        <div className="text-center py-6 text-text-secondary text-sm">
          No outposts match your filters.
        </div>
      )}

      {showingActive && (filteredActive.length > 0 || emptySlots > 0) && (
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
                  onSetPrimary={isPrimary ? undefined : () => onSetPrimary(op.id)}
                  onDeactivate={() => onDeactivate(op)}
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
                    canActivate={canActivate}
                    onActivate={() => onActivate(op)}
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
