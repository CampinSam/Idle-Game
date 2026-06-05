import { useState, useCallback, useMemo } from 'react';
import { useNow } from '../../../../hooks/useNow';
import { useAppSelector } from '../../../../store';
import { useLocationTimers } from '../../../../hooks/useLocationTimers';
import { GameImage } from '../../../../components/GameImage';
import GameIcon from '../../../../components/GameIcon';
import BuildingProgressBar from '../../../../components/BuildingProgressBar';
import { resolveIcon, resolveName } from '../../../../utils/iconResolver';
import { formatRate } from '../../../../utils/locationProduction';
import { getRegionDisplay } from '@derp/shared';
import { getLocationImagePath } from '../../../../config/images';
import { useCommand } from '../../../../hooks/useCommand';
import { useNotifications } from '../../../../context/NotificationContext';
import type { LocationCardProps } from '../../registry';
import { getUniqueEntry } from './getUniqueEntry';
import { getUtcDay, getSecondsUntilUtcMidnight, formatCountdown } from '../../../../features/powers/powerUtils';

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
  'rounded-[14px] overflow-hidden flex flex-col relative ' +
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

function UniquePowerPanel({
  locationId,
  powers,
  onClick,
}: {
  locationId: string;
  powers: import('@derp/shared').PowerRef[];
  onClick?: () => void;
}) {
  const { execute } = useCommand();
  const { addTransientToast } = useNotifications();
  const storedUsages = useAppSelector((s) => s.sync.locationPowerUsages[locationId] ?? {});
  const [triggering, setTriggering] = useState<string | null>(null);
  const now = useNow(1000);
  const countdown = getSecondsUntilUtcMidnight(now);

  const today = getUtcDay();
  const usageState = useMemo<Record<string, { usageCount: number; dailyLimit: number }>>(() => {
    const result: Record<string, { usageCount: number; dailyLimit: number }> = {};
    for (const p of powers) {
      const entry = storedUsages[p.key];
      if (entry && entry.lastUsedUtcDay === today) {
        result[p.key] = { usageCount: entry.usageCount, dailyLimit: p.dailyLimit ?? 1 };
      }
    }
    return result;
  }, [storedUsages, powers, today]);

  const handleTrigger = useCallback(
    async (e: React.MouseEvent, key: string) => {
      e.stopPropagation();
      if (triggering) return;
      setTriggering(key);
      try {
        const res = await execute('TriggerLocationPower', { locationId, powerKey: key });
        const toast = (res.ui as any[]).find((u) => u.type === 'toast');
        if (toast) {
          addTransientToast({
            title: toast.tone === 'success' ? 'Power Triggered!' : 'Error',
            body: toast.message,
            icon: toast.tone === 'success' ? '⚡' : '❌',
            accentColor: toast.tone === 'success' ? '#F59E0B' : '#EF4444',
            durationMs: 8000,
          });
        }
      } catch (err: any) {
        const msg = err?.message || 'Failed to trigger power';
        const isLimit = msg.includes('Daily limit') || msg.includes('limit reached');
        addTransientToast({
          title: isLimit ? 'Daily Limit Reached' : 'Power Failed',
          body: msg,
          icon: '❌',
          accentColor: '#EF4444',
          durationMs: 8000,
        });
      } finally {
        setTriggering(null);
      }
    },
    [locationId, execute, addTransientToast, triggering],
  );

  if (powers.length === 0) return null;

  return (
    <div
      className="flex flex-col gap-1 pt-1 border-t border-white/[0.07]"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="text-[9px] font-black tracking-[0.8px] text-[#fde68a]/70 uppercase">Unique Powers</div>
      {powers.map((p) => {
        const usage = usageState[p.key];
        const limit = typeof p.dailyLimit === 'number' && p.dailyLimit > 0 ? p.dailyLimit : 1;
        const isAtLimit = usage ? usage.usageCount >= limit : false;
        const usageCount = usage?.usageCount ?? 0;
        const label = p.name;
        const isPercent = p.powerType === 'tick_boost' || p.powerType === 'tick_speed_boost'
          || p.powerDefId === 'global_tick_boost';
        const valueLabel = isPercent ? `+${p.value}% · ${p.durationMinutes}m` : `+${p.value} · ${p.durationMinutes}m`;
        const remaining = Math.max(0, limit - usageCount);
        return (
          <div key={p.key}>
            {isAtLimit ? (
              <div className="flex items-center justify-between gap-1 bg-white/[0.04] rounded px-2 py-1">
                <span className="text-[9px] font-bold text-white/40 truncate">{label}</span>
                <span className="text-[8px] font-mono text-white/30 flex-shrink-0">
                  Resets {formatCountdown(countdown)}
                </span>
              </div>
            ) : (
              <button
                className="w-full flex flex-col gap-[2px] bg-gradient-to-r from-[#7C3AED]/30 to-[#F59E0B]/20 hover:from-[#7C3AED]/50 hover:to-[#F59E0B]/35 border border-[#F59E0B]/30 rounded px-2 py-1 cursor-pointer transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={!!triggering}
                onClick={(e) => handleTrigger(e, p.key)}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[9px] font-bold text-[#fde68a] truncate">{label}</span>
                  <span className="text-[8px] text-[#fde68a]/70 flex-shrink-0">{valueLabel}</span>
                </div>
                <div className="flex items-center gap-1">
                  {Array.from({ length: limit }).map((_, i) => (
                    <div
                      key={i}
                      className={[
                        'w-1.5 h-1.5 rounded-full',
                        i < usageCount ? 'bg-white/15' : 'bg-[#F59E0B]/60',
                      ].join(' ')}
                    />
                  ))}
                  <span className="text-[8px] text-white/40 ml-0.5">{remaining}/{limit}</span>
                </div>
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
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

  const uniqueEntry = getUniqueEntry(
    { nftAssetId },
    op.definition || { rules: op.rules },
  );

  const totalRatePerHour = resourceSummaries.reduce((s, r) => {
    const isFull = r.capacity > 0 && r.currentAmount / r.capacity >= 0.995;
    return isFull ? s : s + r.netRatePerHour;
  }, 0);

  const displayName = op.name || regionName;

  const borderClass = uniqueEntry
    ? ''
    : isPrimary
    ? 'border-[#a78bfa] hover:border-[#c4b5fd]'
    : isInactive
    ? 'border-[rgba(139,92,246,0.15)] hover:border-[rgba(139,92,246,0.35)]'
    : 'border-[rgba(139,92,246,0.22)] hover:border-[rgba(139,92,246,0.6)]';

  const uniqueClass = uniqueEntry ? 'location-card--unique' : '';

  const hasStorageFallback = resourceSummaries.length === 0 &&
    Object.values((op.storage?.stored as Record<string, number>) || {}).some((v) => v >= 1);

  return (
    <div
      className={`${CARD_BASE} ${uniqueClass} ${borderClass} ${isInactive ? 'opacity-60' : ''}`}
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

        {uniqueEntry && uniqueEntry.powers.length > 0 && (
          <UniquePowerPanel
            locationId={op.id}
            powers={uniqueEntry.powers}
            onClick={onClick}
          />
        )}
      </div>
    </div>
  );
}
