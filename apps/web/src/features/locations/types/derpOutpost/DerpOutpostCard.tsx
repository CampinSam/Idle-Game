import { useAppSelector } from '../../../../store';
import { useLocationTimers } from '../../../../hooks/useLocationTimers';
import { useTickRate } from '../../../../tick';
import { GameImage } from '../../../../components/GameImage';
import GameIcon from '../../../../components/GameIcon';
import BuildingProgressBar from '../../../../components/BuildingProgressBar';
import { resolveIcon, resolveName } from '../../../../utils/iconResolver';
import {
  formatRate,
  formatAmount,
  formatTimeRemaining,
  computeInventoryAmount,
} from '../../../../utils/locationProduction';
import { getRegionDisplay } from '@derp/shared';
import type { LocationCardProps } from '../../registry';

export default function DerpOutpostCard({ outpost: op, onClick }: LocationCardProps) {
  const currencyDefs = useAppSelector((s) => s.game.currencyDefs);
  const itemDefs = useAppSelector((s) => s.game.itemDefs);
  const syncItems = useAppSelector((s) => s.sync.items);
  const currencyBalances = useAppSelector((s) => s.sync.currencyBalances);
  const tickRate = useTickRate();
  const locationTimerMap = useLocationTimers();

  const regionDisplay = getRegionDisplay(op.regionId || op.region);
  const regionName = regionDisplay.displayName;
  const regionImage = regionDisplay.imagePath;
  const timerData = locationTimerMap.get(op.id);
  const resourceSummaries = timerData?.resourceSummaries || [];

  const totalRatePerHour = resourceSummaries.reduce((s, r) => {
    const isFull = r.capacity > 0 && r.currentAmount / r.capacity >= 0.995;
    return isFull ? s : s + r.netRatePerHour;
  }, 0);

  return (
    <div
      className="outpost-card-v2"
      onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
    >
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
          <span className="rate-value">{formatRate(totalRatePerHour)}/hr</span>
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
              const invAmount = computeInventoryAmount(
                res.outputType,
                res.outputRefId,
                syncItems,
                currencyBalances,
              );
              const totalAvailable = current + invAmount;
              const hoursLeft = totalAvailable / Math.abs(res.netRatePerHour);
              depletionLabel = formatTimeRemaining(hoursLeft);
            }

            return (
              <div key={res.key} className="storage-bar-row">
                <div className="storage-bar-label">
                  <span className="storage-bar-icon">
                    <GameIcon
                      src={resolveIcon(res.outputType, res.outputRefId, currencyDefs, itemDefs)}
                      size={14}
                    />
                  </span>
                  <span className="storage-bar-name">
                    {resolveName(res.outputType, res.outputRefId, currencyDefs, itemDefs)}
                  </span>
                  <span className={`storage-bar-rate ${isDepleting ? 'rate-negative' : ''}`}>
                    {res.netRatePerHour >= 0 ? '+' : ''}{formatRate(res.netRatePerHour)}/hr
                  </span>
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
              const outputType = 'CURRENCY';

              return (
                <div key={resId} className="storage-bar-row">
                  <div className="storage-bar-label">
                    <span className="storage-bar-icon">
                      <GameIcon
                        src={resolveIcon(outputType, resId, currencyDefs, itemDefs)}
                        size={14}
                      />
                    </span>
                    <span className="storage-bar-name">
                      {resolveName(outputType, resId, currencyDefs, itemDefs)}
                    </span>
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
        {resourceSummaries.length === 0 &&
          !Object.values((op.storage?.stored as Record<string, number>) || {}).some((v) => v >= 1) && (
            <div className="storage-empty">No generators active</div>
          )}
      </div>
    </div>
  );
}
