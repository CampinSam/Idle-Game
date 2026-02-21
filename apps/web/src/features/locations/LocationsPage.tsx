import { useState, useRef, TouchEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppSelector } from '../../store';
import { useSyncLocations } from '../../hooks/useSyncSelectors';
import { getRegionImagePath, slugifyRegion } from '../../config/images';
import { GameImage } from '../../components/GameImage';
import { useCurrentTick, useTickRate } from '../../tick';
import { useLocationTimers } from '../../hooks/useLocationTimers';
import { resolveIcon, resolveName } from '../../utils/iconResolver';
import GameIcon from '../../components/GameIcon';
import BuildingProgressBar from '../../components/BuildingProgressBar';
import {
  formatRate,
  formatAmount,
} from '../../utils/locationProduction';
import './LocationsPage.css';

const REGION_NAMES: Record<string, string> = {
  derpshire_valley: 'Derpshire Valley',
  chillarctica_drifts: 'Chillarctica Drifts',
  sandcrypt_badlands: 'Sandcrypt Badlands',
  chillvine_jungle: 'Chillvine Jungle',
  pinnacle_perch: 'Pinnacle Perch',
  baldos_bog: "Baldo's Bog",
  lavalode_peaks: 'LavaLode Peaks',
  frostpeak_mountains: 'Frostpeak Mountains',
};

const REGION_IMAGES: Record<string, string> = {
  derpshire_valley: '/images/regions/derpshire-valley.png',
  frostpeak_mountains: '/images/regions/frostpeak-mountains.png',
};

const MAX_OUTPOST_SLOTS = 5;

export default function LocationsPage() {
  const navigate = useNavigate();
  const locations = useSyncLocations();
  const currencyDefs = useAppSelector((s) => s.game.currencyDefs);
  const itemDefs = useAppSelector((s) => s.game.itemDefs);
  const [currentPage, setCurrentPage] = useState(0);
  const carouselRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef(0);
  const touchDeltaX = useRef(0);

  const currentTick = useCurrentTick();
  const tickRate = useTickRate();
  const locationTimerMap = useLocationTimers();

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
            const regionName = REGION_NAMES[op.region] || op.region;
            const regionImage = REGION_IMAGES[op.region] || '/images/outpost-scene.png';
            const timerData = locationTimerMap.get(op.id);
            const resourceSummaries = timerData?.resourceSummaries || [];

            const totalRatePerHour = resourceSummaries.reduce(
              (s, r) => s + r.totalRatePerHour, 0,
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
                    fallbackSrc="/images/regions/fallback.png"
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
                  {resourceSummaries.map((res) => {
                    const timer = timerData?.resourceTimers.get(res.key);
                    const current = timer
                      ? timer.getValue(currentTick)
                      : res.currentAmount;
                    const pct = res.capacity > 0
                      ? Math.min(100, (current / res.capacity) * 100)
                      : 0;
                    const isFull = pct >= 99.5;

                    return (
                      <div key={res.key} className="storage-bar-row">
                        <div className="storage-bar-label">
                          <span className="storage-bar-icon"><GameIcon src={resolveIcon(res.outputType, res.outputRefId, currencyDefs, itemDefs)} size={14} /></span>
                          <span className="storage-bar-name">{resolveName(res.outputType, res.outputRefId, currencyDefs, itemDefs)}</span>
                          <span className="storage-bar-rate">+{formatRate(res.totalRatePerHour)}/hr</span>
                        </div>
                        <div className="storage-bar-track">
                          <div
                            className={`storage-bar-fill ${isFull ? 'full' : ''}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <div className="storage-bar-amounts">
                          <span className="storage-current">{formatAmount(current)}</span>
                          <span className="storage-sep">/</span>
                          <span className="storage-cap">{formatAmount(res.capacity)}</span>
                        </div>
                      </div>
                    );
                  })}
                  {resourceSummaries.length === 0 && (
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
