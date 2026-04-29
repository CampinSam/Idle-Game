import { useState, useRef, TouchEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSyncLocations, useSyncStatus } from '../../hooks/useSyncSelectors';
import { getLocationViews } from './registry';
import './LocationsPage.css';

const MAX_OUTPOST_SLOTS = 5;

function LocationsPageSkeleton() {
  return (
    <div className="outposts-page">
      <div className="outpost-carousel">
        <div className="outpost-cards-row">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="outpost-card-v2" style={{ animation: 'none', opacity: 1, flex: 1, minHeight: 220 }}>
              <div className="skeleton" style={{ width: '100%', height: 100, borderRadius: 8, marginBottom: 12 }} />
              <div className="skeleton" style={{ width: '60%', height: 16, borderRadius: 4, marginBottom: 8 }} />
              <div className="skeleton" style={{ width: '80%', height: 12, borderRadius: 4, marginBottom: 8 }} />
              <div className="skeleton" style={{ width: '40%', height: 12, borderRadius: 4 }} />
            </div>
          ))}
        </div>
      </div>
      <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
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
  const vacantSlots = MAX_OUTPOST_SLOTS - locations.length;

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
    <div className="outposts-page">
      <div
        className="outpost-carousel"
        ref={carouselRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className="outpost-cards-row">
          {pagedLocations.map((op: any) => {
            const { Card } = getLocationViews(op.region, op.isUnique, op.definitionId);
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
        <div className="carousel-dots">
          {Array.from({ length: totalPages }).map((_, i) => (
            <button
              key={i}
              className={`dot ${i === currentPage ? 'active' : ''}`}
              onClick={() => setCurrentPage(i)}
            />
          ))}
        </div>
      )}

      {vacantSlots > 0 && (
        <div className="vacant-slots-section">
          <div className="vacant-slots-grid">
            {Array.from({ length: Math.min(vacantSlots, 3) }).map((_, i) => (
              <div key={i} className="vacant-slot-card">
                <div className="vacant-title">VACANT SLOT</div>
                <div className="vacant-icon">🔒</div>
                <div className="vacant-label">AVAILABLE SLOT</div>
                <button className="unlock-btn">UNLOCK SLOT</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {locations.length === 0 && (
        <div className="empty-state">No locations yet.</div>
      )}
    </div>
  );
}
