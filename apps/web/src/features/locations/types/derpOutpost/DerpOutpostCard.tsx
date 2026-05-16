import { useAppSelector } from '../../../../store';
import { useLocationTimers } from '../../../../hooks/useLocationTimers';
import { GameImage } from '../../../../components/GameImage';
import GameIcon from '../../../../components/GameIcon';
import BuildingProgressBar from '../../../../components/BuildingProgressBar';
import { resolveIcon, resolveName } from '../../../../utils/iconResolver';
import { formatRate } from '../../../../utils/locationProduction';
import { getRegionDisplay } from '@derp/shared';
import { getLocationImagePath } from '../../../../config/images';
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

const CARD_BASE =
  'flex-1 min-w-0 bg-gradient-to-b from-[#1e1850] to-[#151030] border ' +
  'rounded-[14px] overflow-hidden flex flex-col ' +
  'motion-safe:animate-[card-enter_0.25s_ease-out_both] ' +
  'transition-[border-color]';

const RATE_BASE = 'text-[10px] font-semibold flex-shrink-0';

function rateClass(isFull: boolean, isDepleting: boolean): string {
  if (isFull) return `${RATE_BASE} text-[#F59E0B] bg-[rgba(245,158,11,0.12)] px-1.5 py-[1px] rounded tracking-[0.4px] font-bold`;
  if (isDepleting) return `${RATE_BASE} text-[#EF4444]`;
  return `${RATE_BASE} text-[#10B981]`;
}

function fillClass(isFull: boolean, isDepleting: boolean): string {
  if (isDepleting) return 'h-full rounded transition-[width] duration-500 bg-gradient-to-r from-[#EF4444] to-[#DC2626] motion-safe:animate-[deplete-pulse_2s_ease-in-out_infinite]';
  if (isFull) return 'h-full rounded transition-[width] duration-500 bg-gradient-to-r from-[#F59E0B] to-[#FBBF24]';
  return 'h-full rounded transition-[width] duration-500 bg-gradient-to-r from-[#7C3AED] to-[#A855F7]';
}

export default function DerpOutpostCard({
  outpost: op,
  onClick,
  isPrimary = false,
  isInactive = false,
}: LocationCardProps) {
  const currencyDefs = useAppSelector((s) => s.game.currencyDefs);
  const itemDefs = useAppSelector((s) => s.game.itemDefs);
  const locationTimerMap = useLocationTimers();

  const regionDisplay = getRegionDisplay(op.regionId || op.region);
  const regionName = regionDisplay.displayName;
  const regionImage = regionDisplay.imagePath;
  const cardImageSrc = getLocationImagePath(op.nftImageUrl, regionImage, 'thumb');
  const nftAssetId: string | undefined = op.nftAssetId;
  const nftExplorerUrl = nftAssetId ? buildNftExplorerUrl(nftAssetId) : null;
  const timerData = locationTimerMap.get(op.id);
  const resourceSummaries = timerData?.resourceSummaries || [];

  const totalRatePerHour = resourceSummaries.reduce((s, r) => {
    const isFull = r.capacity > 0 && r.currentAmount / r.capacity >= 0.995;
    return isFull ? s : s + r.netRatePerHour;
  }, 0);

  const displayName = op.name || regionName;

  const borderClass = isPrimary
    ? 'border-[#a78bfa] hover:border-[#c4b5fd]'
    : isInactive
    ? 'border-[rgba(139,92,246,0.15)] hover:border-[rgba(139,92,246,0.35)]'
    : 'border-[rgba(139,92,246,0.22)] hover:border-[rgba(139,92,246,0.6)]';

  const hasStorageFallback = resourceSummaries.length === 0 &&
    Object.values((op.storage?.stored as Record<string, number>) || {}).some((v) => v >= 1);

  return (
    <div
      className={`${CARD_BASE} ${borderClass} ${isInactive ? 'opacity-60' : ''}`}
      onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
    >
      <div className="relative overflow-hidden">
        <GameImage
          src={cardImageSrc}
          category="regions"
          alt={displayName}
          fallbackSrc={regionImage}
          nativeRatio
        />
        <div className="absolute top-[6px] right-[6px] flex items-center gap-[3px] bg-[rgba(0,0,0,0.62)] border border-[rgba(139,92,246,0.55)] rounded-[20px] px-[7px] py-[2px] z-[2]">
          <span className="text-[8px] font-black text-[rgba(167,139,250,0.85)] tracking-[0.5px]">LVL</span>
          <span className="text-sm font-black text-white leading-none">{op.level}</span>
        </div>
        <div className="absolute top-[6px] left-[6px] flex flex-col gap-1 z-[2]">
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
          {isPrimary && (
            <span className="bg-gradient-to-br from-[#a78bfa] to-[#7C3AED] text-white text-[9px] font-black px-1.5 py-[2px] rounded tracking-[0.5px] shadow-[0_0_8px_rgba(167,139,250,0.5)]">
              ★ Primary
            </span>
          )}
        </div>
      </div>

      <div className="px-2.5 pt-2 pb-2.5 flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-1">
          <span className="text-[11px] font-extrabold tracking-[0.4px] text-text-primary truncate">
            {displayName.toUpperCase()}
          </span>
          <span className="text-[11px] font-bold text-text-primary flex-shrink-0 flex items-center gap-0.5">
            <span className="text-[10px]">⚡</span>
            {formatRate(totalRatePerHour)}/hr
          </span>
        </div>

        {(op.buildings || [])
          .filter((b: any) => b.status === 'building' && b.jobId)
          .map((b: any) => (
            <BuildingProgressBar
              key={b.id}
              name={b.name}
              startTick={b.startTick}
              durationTicks={b.durationTicks}
              isUpgrade={!!b.jobData?.upgradeToLevel}
              compact
            />
          ))}

        <div className="flex flex-col gap-1.5">
          {resourceSummaries.length > 0 ? (
            resourceSummaries.map((res) => {
              const pct = res.capacity > 0
                ? Math.min(100, (res.currentAmount / res.capacity) * 100)
                : 0;
              const isFull = pct >= 99.5;
              const isDepleting = res.netRatePerHour < 0;
              return (
                <div key={res.key} className="flex flex-col gap-[3px]">
                  <div className="flex items-center gap-1">
                    <span className="flex-shrink-0">
                      <GameIcon
                        src={resolveIcon(res.outputType, res.outputRefId, currencyDefs, itemDefs)}
                        size={12}
                      />
                    </span>
                    <span className="text-[10px] font-bold text-text-primary flex-1 min-w-0 truncate">
                      {resolveName(res.outputType, res.outputRefId, currencyDefs, itemDefs)}
                    </span>
                    <span className={rateClass(isFull, isDepleting)}>
                      {isFull ? 'FULL' : `${res.netRatePerHour >= 0 ? '+' : ''}${formatRate(res.netRatePerHour)}/hr`}
                    </span>
                  </div>
                  <div className="h-1.5 bg-white/[0.06] rounded overflow-hidden">
                    <div className={fillClass(isFull, isDepleting)} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })
          ) : hasStorageFallback ? (
            Object.entries((op.storage?.stored as Record<string, number>) || {})
              .filter(([, amount]) => amount >= 1)
              .map(([resId, amount]) => {
                const capacity = (op.storage?.capacity as Record<string, number>)?.[resId] || 0;
                const pct = capacity > 0 ? Math.min(100, (amount / capacity) * 100) : 0;
                const isFull = pct >= 99.5;
                return (
                  <div key={resId} className="flex flex-col gap-[3px]">
                    <div className="flex items-center gap-1">
                      <span className="flex-shrink-0">
                        <GameIcon
                          src={resolveIcon('CURRENCY', resId, currencyDefs, itemDefs)}
                          size={12}
                        />
                      </span>
                      <span className="text-[10px] font-bold text-text-primary flex-1 min-w-0 truncate">
                        {resolveName('CURRENCY', resId, currencyDefs, itemDefs)}
                      </span>
                      <span className={rateClass(false, false)}>+0/hr</span>
                    </div>
                    <div className="h-1.5 bg-white/[0.06] rounded overflow-hidden">
                      <div className={fillClass(isFull, false)} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })
          ) : (
            <div className="text-[10px] text-text-secondary text-center py-0.5">No generators active</div>
          )}
        </div>
      </div>
    </div>
  );
}
