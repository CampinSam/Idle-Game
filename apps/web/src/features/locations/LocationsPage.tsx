import { useState, useRef, TouchEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppSelector } from '../../store';
import { useSyncLocations, useSyncStatus } from '../../hooks/useSyncSelectors';
import { getRegionImagePath, slugifyRegion } from '../../config/images';
import { GameImage } from '../../components/GameImage';
import { useTickRate } from '../../tick';
import { useLocationTimers } from '../../hooks/useLocationTimers';
import { resolveIcon, resolveName } from '../../utils/iconResolver';
import GameIcon from '../../components/GameIcon';
import BuildingProgressBar from '../../components/BuildingProgressBar';
import {
  formatRate,
  formatAmount,
  formatTimeRemaining,
  computeInventoryAmount,
} from '../../utils/locationProduction';
import { getRegionDisplay } from '@derp/shared';
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
  const currencyDefs = useAppSelector((s) => s.game.currencyDefs);
  const itemDefs = useAppSelector((s) => s.game.itemDefs);
  const syncItems = useAppSelector((s) => s.sync.items);
  const currencyBalances = useAppSelector((s) => s.sync.currencyBalances);
  const [currentPage, setCurrentPage] = useState(0);
  const carouselRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef(0);
  const touchDeltaX = useRef(0);
  const tickRate = useTickRate();
  const locationTimerMap = useLocationTimers();

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
            const regionDisplay = getRegionDisplay(op.region);
            const regionName = regionDisplay.displayName;
            const regionImage = regionDisplay.imagePath;
            const timerData = locationTimerMap.get(op.id);
            const resourceSummaries = timerData?.resourceSummaries || [];

            const totalRatePerHour = resourceSummaries.reduce(
              (s, r) => s + r.netRatePerHour, 0,
            );

            return (
              <div key={op.id} className="outpost-card-v2" onClick={() => navigate(`/locations/${op.id}`)} style={{ cursor: 'pointer' }}>
                <div className="outpost-card-top">
                  <span className="outpost-region-name">{regionName.toUpperCase()}</span>
                  <span className="outpost-lv-badge">⭐ Lv. {op.level}</span>
                </div>
                <div className="outpost-card-image">
                  <GameImage
                    src={regionImage}
                    category="regions"
                    alt={regionName}
                    fallbackSrc="/media/images/regions/fallback.png"
                  />
                </div>
                <div className="outpost-card-stats">
                  <div className="production-rate">
                    <span className="rate-icon">⚡</span>
                    <span className="rate-value">
                      {formatRate(totalRatePerHour)}/hr
                    </span>
                  </div>
                  <div className="level-display">
                    Level <strong>{op.level}</strong>
                  </div>
                </div>

                <div className="outpost-storage-bars">
                  {(op.buildings || [])
                    .filter((b: any) => b.status === 'building' && b.jobId)
                    .map((b: any) => (
                      <BuildingProgressBar
                        key={b.id}
                        name={b.name}
                        startTick={b.startTick}
                        durationTicks={b.durationTicks}
                        tickRate={tickRate}
                        isUpgrade={!!b.jobData?.upgradeToLevel}
                        compact
                      />
                    ))}
                  {resourceSummaries.length > 0 ? (
                    resourceSummaries.map((res) => {
                      const current = res.currentAmount;
                      const pct = res.capacity > 0
                        ? Math.min(100, (current / res.capacity) * 100)
                        : 0;
                      const isFull = pct >= 99.5;
                      const isDepleting = res.netRatePerHour < 0;
                      let depletionLabel = '';
                      if (isDepleting) {
                        const invAmount = computeInventoryAmount(res.outputType, res.outputRefId, syncItems, currencyBalances);
                        const totalAvailable = current + invAmount;
                        const hoursLeft = totalAvailable / Math.abs(res.netRatePerHour);
                        depletionLabel = formatTimeRemaining(hoursLeft);
                      }

                      return (
                        <div key={res.key} className="storage-bar-row">
                          <div className="storage-bar-label">
                            <span className="storage-bar-icon"><GameIcon src={resolveIcon(res.outputType, res.outputRefId, currencyDefs, itemDefs)} size={14} /></span>
                            <span className="storage-bar-name">{resolveName(res.outputType, res.outputRefId, currencyDefs, itemDefs)}</span>
                            <span className={`storage-bar-rate ${isDepleting ? 'rate-negative' : ''}`}>{res.netRatePerHour >= 0 ? '+' : ''}{formatRate(res.netRatePerHour)}/hr</span>
                          </div>
                          <div className="storage-bar-track">
                            <div
                              className={`storage-bar-fill ${isFull ? 'full' : ''} ${isDepleting ? 'depleting' : ''}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <div className="storage-bar-amounts">
                            <span className="storage-current">{formatAmount(current)}</span>
                            <span className="storage-sep">/</span>
                            <span className="storage-cap">{formatAmount(res.capacity)}</span>
                            {isDepleting && (
                              <span className="storage-depletion-badge">⚠ {depletionLabel}</span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    Object.entries((op.storage?.stored as Record<string, number>) || {})
                      .filter(([, amount]) => amount >= 1)
                      .map(([resId, amount]) => {
                        const capacity = (op.storage?.capacity as any)?.[resId] || 0;
                        const pct = capacity > 0 ? Math.min(100, (amount / capacity) * 100) : 0;
                        const isFull = pct >= 99.5;
                        // For items/currencies, we'd ideally know the type.
                        // Default to CURRENCY as it's common for produced resources.
                        const outputType = 'CURRENCY';

                        return (
                          <div key={resId} className="storage-bar-row">
                            <div className="storage-bar-label">
                              <span className="storage-bar-icon"><GameIcon src={resolveIcon(outputType, resId, currencyDefs, itemDefs)} size={14} /></span>
                              <span className="storage-bar-name">{resolveName(outputType, resId, currencyDefs, itemDefs)}</span>
                              <span className="storage-bar-rate">+0/hr</span>
                            </div>
                            <div className="storage-bar-track">
                              <div
                                className={`storage-bar-fill ${isFull ? 'full' : ''}`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <div className="storage-bar-amounts">
                              <span className="storage-current">{formatAmount(amount)}</span>
                              <span className="storage-sep">/</span>
                              <span className="storage-cap">{formatAmount(capacity)}</span>
                            </div>
                          </div>
                        );
                      })
                  )}
                  {resourceSummaries.length === 0 && !Object.values((op.storage?.stored as Record<string, number>) || {}).some(v => v >= 1) && (
                    <div className="storage-empty">No generators active</div>
                  )}
                </div>

              </div>
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
