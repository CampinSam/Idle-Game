import { useState, useRef, TouchEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSyncLocations, useSyncStatus } from '../../hooks/useSyncSelectors';
import { getLocationViews } from './registry';

const PAGE_CLASS =
  'flex flex-col flex-1 min-h-0 overflow-x-hidden overflow-y-auto ' +
  '[-webkit-overflow-scrolling:touch] overscroll-contain';

function LocationsPageSkeleton() {
  return (
    <div className={PAGE_CLASS}>
      <div className="overflow-hidden touch-pan-y mb-3">
        <div className="flex gap-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <div
              key={i}
              className="flex-1 min-w-0 bg-gradient-to-b from-[#1e1850] to-[#151030] border-2 border-derp-purple rounded-[14px] overflow-hidden flex flex-col"
              style={{ minHeight: 220 }}
            >
              <div className="skeleton" style={{ width: '100%', height: 100, borderRadius: 8, margin: '12px 8px 12px' }} />
              <div className="skeleton" style={{ width: '60%', height: 16, borderRadius: 4, margin: '0 12px 8px' }} />
              <div className="skeleton" style={{ width: '80%', height: 12, borderRadius: 4, margin: '0 12px 8px' }} />
              <div className="skeleton" style={{ width: '40%', height: 12, borderRadius: 4, margin: '0 12px' }} />
            </div>
          ))}
        </div>
      </div>
      <div className="px-4 flex flex-col gap-3 mt-4">
        <div className="skeleton" style={{ width: '100%', height: 80, borderRadius: 10 }} />
        <div className="skeleton" style={{ width: '100%', height: 80, borderRadius: 10 }} />
      </div>
    </div>
  );
}

export default function LocationsPage() {
  const navigate = useNavigate();
  const locations = useSyncLocations();
  const syncStatus = useSyncStatus();
  const [currentPage, setCurrentPage] = useState(0);
  const carouselRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef(0);
  const touchDeltaX = useRef(0);

  if (syncStatus === 'disconnected') return <LocationsPageSkeleton />;

  const totalPages = Math.max(1, Math.ceil(locations.length / 2));
  const vacantSlots = 5 - locations.length;

  const handleTouchStart = (e: TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchDeltaX.current = 0;
  };

  const handleTouchMove = (e: TouchEvent) => {
    touchDeltaX.current = e.touches[0].clientX - touchStartX.current;
  };

  const handleTouchEnd = () => {
    if (touchDeltaX.current < -50 && currentPage < totalPages - 1) {
      setCurrentPage(currentPage + 1);
    } else if (touchDeltaX.current > 50 && currentPage > 0) {
      setCurrentPage(currentPage - 1);
    }
  };

  const pagedLocations = locations.slice(currentPage * 2, currentPage * 2 + 2);

  return (
    <div className={PAGE_CLASS}>
      <div
        className="overflow-hidden touch-pan-y mb-3"
        ref={carouselRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className="flex gap-3">
          {pagedLocations.map((op: any) => {
            const { Card } = getLocationViews(op.kind || op.region, op.isUnique, op.definitionId);
            return (
              <Card
                key={op.id}
                outpost={op}
                onClick={() => navigate(`/locations/${op.id}`)}
              />
            );
          })}
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mb-5">
          {Array.from({ length: totalPages }).map((_, i) => (
            <button
              key={i}
              className={`w-2.5 h-2.5 rounded-full border-0 p-0 cursor-pointer transition-all ${
                i === currentPage
                  ? 'bg-derp-purple shadow-[0_0_6px_var(--derp-purple)]'
                  : 'bg-bg-secondary border border-border'
              }`}
              onClick={() => setCurrentPage(i)}
            />
          ))}
        </div>
      )}

      {vacantSlots > 0 && (
        <div className="mt-4">
          <div className="grid grid-cols-3 gap-2.5">
            {Array.from({ length: Math.min(vacantSlots, 3) }).map((_, i) => (
              <div
                key={i}
                className="bg-bg-card border border-dashed border-border rounded-xl p-4 flex flex-col items-center gap-2 text-center"
              >
                <div className="text-[11px] font-extrabold tracking-[0.8px] text-text-secondary">VACANT SLOT</div>
                <div className="text-2xl opacity-50">🔒</div>
                <div className="text-[10px] text-text-secondary tracking-[0.3px]">AVAILABLE SLOT</div>
                <button className="bg-bg-secondary border border-border text-text-secondary px-3 py-1.5 text-[10px] font-bold rounded-md tracking-[0.3px] hover:border-derp-purple hover:text-text-primary transition-colors cursor-pointer">
                  UNLOCK SLOT
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {locations.length === 0 && (
        <div className="text-center p-10 text-text-secondary text-sm">No locations yet.</div>
      )}
    </div>
  );
}
