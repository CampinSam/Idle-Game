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

function buildNftExplorerUrl(nftAssetId: string): string | null {
  const parts = nftAssetId.split(':');
  if (parts.length < 3) return null;
  const [chain, policyId, assetId] = parts;
  if (chain === 'CARDANO') {
    return `https://pool.pm/${policyId}.${assetId}`;
  }
  return null;
}

const CARD_CLASS =
  'flex-1 min-w-0 bg-gradient-to-b from-[#1e1850] to-[#151030] border-2 border-derp-purple ' +
  'rounded-[14px] overflow-hidden flex flex-col motion-safe:animate-[card-enter_0.25s_ease-out_both]';

const STORAGE_BAR_RATE_BASE = 'text-[10px] font-semibold flex-shrink-0';

function storageBarRateClass(isFull: boolean, isDepleting: boolean): string {
  if (isFull) return `${STORAGE_BAR_RATE_BASE} text-[#F59E0B] bg-[rgba(245,158,11,0.12)] px-1.5 py-[1px] rounded tracking-[0.4px] font-bold`;
  if (isDepleting) return `${STORAGE_BAR_RATE_BASE} text-[#EF4444]`;
  return `${STORAGE_BAR_RATE_BASE} text-[#10B981]`;
}

function storageFillClass(isFull: boolean, isDepleting: boolean): string {
  if (isDepleting) return 'h-full rounded transition-[width] duration-500 bg-gradient-to-r from-[#EF4444] to-[#DC2626] motion-safe:animate-[deplete-pulse_2s_ease-in-out_infinite]';
  if (isFull) return 'h-full rounded transition-[width] duration-500 bg-gradient-to-r from-[#F59E0B] to-[#FBBF24]';
  return 'h-full rounded transition-[width] duration-500 bg-gradient-to-r from-[#7C3AED] to-[#A855F7]';
}

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
  const nftAssetId: string | undefined = op.nftAssetId;
  const nftExplorerUrl = nftAssetId ? buildNftExplorerUrl(nftAssetId) : null;
  const timerData = locationTimerMap.get(op.id);
  const resourceSummaries = timerData?.resourceSummaries || [];

  const totalRatePerHour = resourceSummaries.reduce((s, r) => {
    const isFull = r.capacity > 0 && r.currentAmount / r.capacity >= 0.995;
    return isFull ? s : s + r.netRatePerHour;
  }, 0);

  return (
    <div
      className={CARD_CLASS}
      onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
    >
      <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5">
        <span className="text-xs font-extrabold tracking-[0.8px] text-text-primary">{regionName.toUpperCase()}</span>
        <div className="flex items-center gap-1.5">
          {nftAssetId && (
            nftExplorerUrl ? (
              <a
                href={nftExplorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-0.5 bg-gradient-to-br from-[#7C3AED] to-[#4F46E5] text-white text-[9px] font-bold px-1.5 py-[2px] rounded tracking-[0.5px] no-underline hover:brightness-110 transition-[filter]"
              >
                🔗 NFT
              </a>
            ) : (
              <span className="bg-gradient-to-br from-[#7C3AED] to-[#4F46E5] text-white text-[9px] font-bold px-1.5 py-[2px] rounded tracking-[0.5px]">
                NFT
              </span>
            )
          )}
          <span className="bg-gradient-to-br from-[#10B981] to-[#059669] text-white text-[11px] font-bold px-2.5 py-[3px] rounded-xl">
            ⭐ Lv. {op.level}
          </span>
        </div>
      </div>

      <div className="px-2 mb-2 [&_img]:w-full [&_img]:h-[120px] [&_img]:object-cover [&_img]:rounded-[10px]">
        <GameImage
          src={regionImage}
          category="regions"
          alt={regionName}
          fallbackSrc="/media/images/regions/fallback.png"
        />
      </div>

      <div className="flex items-center justify-between px-3 mb-2">
        <div className="flex items-center gap-1">
          <span className="text-sm">⚡</span>
          <span className="text-sm font-bold text-text-primary">{formatRate(totalRatePerHour)}/hr</span>
        </div>
        <div className="text-[13px] text-text-secondary">
          Level <strong className="text-text-primary text-base">{op.level}</strong>
        </div>
      </div>

      <div className="flex flex-col gap-1.5 px-2.5 mb-2.5">
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
              <div key={res.key} className="flex flex-col gap-[3px]">
                <div className="flex items-center gap-1 text-[11px]">
                  <span className="text-xs flex-shrink-0">
                    <GameIcon
                      src={resolveIcon(res.outputType, res.outputRefId, currencyDefs, itemDefs)}
                      size={14}
                    />
                  </span>
                  <span className="font-bold text-text-primary flex-1 min-w-0 whitespace-nowrap overflow-hidden text-ellipsis">
                    {resolveName(res.outputType, res.outputRefId, currencyDefs, itemDefs)}
                  </span>
                  <span className={storageBarRateClass(isFull, isDepleting)}>
                    {isFull ? 'FULL' : `${res.netRatePerHour >= 0 ? '+' : ''}${formatRate(res.netRatePerHour)}/hr`}
                  </span>
                </div>
                <div className="h-2 bg-white/[0.06] rounded overflow-hidden">
                  <div
                    className={storageFillClass(isFull, isDepleting)}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="flex items-center gap-0.5 text-[10px]">
                  <span className="font-extrabold text-text-primary">{formatAmount(current)}</span>
                  <span className="text-text-secondary">/</span>
                  <span className="text-text-secondary font-semibold">{formatAmount(res.capacity)}</span>
                  {isDepleting && (
                    <span className="text-[9px] font-bold text-[#F59E0B] ml-1 whitespace-nowrap">⚠ {depletionLabel}</span>
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
                <div key={resId} className="flex flex-col gap-[3px]">
                  <div className="flex items-center gap-1 text-[11px]">
                    <span className="text-xs flex-shrink-0">
                      <GameIcon
                        src={resolveIcon(outputType, resId, currencyDefs, itemDefs)}
                        size={14}
                      />
                    </span>
                    <span className="font-bold text-text-primary flex-1 min-w-0 whitespace-nowrap overflow-hidden text-ellipsis">
                      {resolveName(outputType, resId, currencyDefs, itemDefs)}
                    </span>
                    <span className={storageBarRateClass(false, false)}>+0/hr</span>
                  </div>
                  <div className="h-2 bg-white/[0.06] rounded overflow-hidden">
                    <div
                      className={storageFillClass(isFull, false)}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="flex items-center gap-0.5 text-[10px]">
                    <span className="font-extrabold text-text-primary">{formatAmount(amount)}</span>
                    <span className="text-text-secondary">/</span>
                    <span className="text-text-secondary font-semibold">{formatAmount(capacity)}</span>
                  </div>
                </div>
              );
            })
        )}
        {resourceSummaries.length === 0 &&
          !Object.values((op.storage?.stored as Record<string, number>) || {}).some((v) => v >= 1) && (
            <div className="text-[11px] text-text-secondary text-center py-1.5">No generators active</div>
          )}
      </div>
    </div>
  );
}
