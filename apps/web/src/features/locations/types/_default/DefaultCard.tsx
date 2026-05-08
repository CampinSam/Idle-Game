import { useAppSelector } from '../../../../store';
import { useLocationTimers } from '../../../../hooks/useLocationTimers';
import { resolveIcon, resolveName } from '../../../../utils/iconResolver';
import GameIcon from '../../../../components/GameIcon';
import {
  formatRate,
  formatAmount,
} from '../../../../utils/locationProduction';
import { getRegionDisplay } from '@derp/shared';
import type { LocationCardProps } from '../../registry';

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

export default function DefaultCard({ outpost, onClick }: LocationCardProps) {
  const currencyDefs = useAppSelector((s) => s.game.currencyDefs);
  const itemDefs = useAppSelector((s) => s.game.itemDefs);
  const locationTimerMap = useLocationTimers();
  const timerData = locationTimerMap.get(outpost.id);
  const resourceSummaries = timerData?.resourceSummaries || [];
  const regionDisplay = getRegionDisplay(outpost.regionId || outpost.region);
  const regionLabel = (regionDisplay.displayName || 'Location').toUpperCase();

  return (
    <div
      className={CARD_CLASS}
      onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
    >
      <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5">
        <span className="text-xs font-extrabold tracking-[0.8px] text-text-primary">{regionLabel}</span>
        <span className="bg-gradient-to-br from-[#10B981] to-[#059669] text-white text-[11px] font-bold px-2.5 py-[3px] rounded-xl">
          ⭐ Lv. {outpost.level}
        </span>
      </div>

      <div className="flex items-center justify-between px-3 mb-2">
        <div className="text-[13px] text-text-secondary">
          Level <strong className="text-text-primary text-base">{outpost.level}</strong>
        </div>
      </div>

      <div className="flex flex-col gap-1.5 px-2.5 mb-2.5">
        {resourceSummaries.length > 0 ? (
          resourceSummaries.map((res) => {
            const pct = res.capacity > 0
              ? Math.min(100, (res.currentAmount / res.capacity) * 100)
              : 0;
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
                  <span className={storageBarRateClass(false, false)}>
                    {res.netRatePerHour >= 0 ? '+' : ''}{formatRate(res.netRatePerHour)}/hr
                  </span>
                </div>
                <div className="h-2 bg-white/[0.06] rounded overflow-hidden">
                  <div className={storageFillClass(false, false)} style={{ width: `${pct}%` }} />
                </div>
                <div className="flex items-center gap-0.5 text-[10px]">
                  <span className="font-extrabold text-text-primary">{formatAmount(res.currentAmount)}</span>
                  <span className="text-text-secondary">/</span>
                  <span className="text-text-secondary font-semibold">{formatAmount(res.capacity)}</span>
                </div>
              </div>
            );
          })
        ) : (
          <div className="text-[11px] text-text-secondary text-center py-1.5">No generators active</div>
        )}
      </div>
    </div>
  );
}
