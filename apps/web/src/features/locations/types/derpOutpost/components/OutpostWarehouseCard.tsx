import { useAppSelector } from '../../../../../store';
import { resolveIcon, resolveName } from '../../../../../utils/iconResolver';
import GameIcon from '../../../../../components/GameIcon';
import { EmptyState, OutpostCard, OutpostCardTitle } from '../../../../../components/ui';
import {
  formatAmount,
  formatTimeRemaining,
  computeInventoryAmount,
} from '../../../../../utils/locationProduction';

interface WarehouseItem {
  key: string;
  outputType: string;
  outputRefId: string;
  current: number;
  capacity: number;
}

interface OutpostWarehouseCardProps {
  hasWarehouse: boolean;
  storageItems: WarehouseItem[];
  resourceSummaries: any[];
  warehouseDef: any;
  slotsBlocked: boolean;
  onBuild: (def: any) => void;
}

export function OutpostWarehouseCard({
  hasWarehouse,
  storageItems,
  resourceSummaries,
  warehouseDef,
  slotsBlocked,
  onBuild,
}: OutpostWarehouseCardProps) {
  const currencyDefs = useAppSelector((s) => s.game.currencyDefs);
  const itemDefs = useAppSelector((s) => s.game.itemDefs);
  const syncItems = useAppSelector((s) => s.sync.items);
  const currencyBalances = useAppSelector((s) => s.sync.currencyBalances);

  const ctaDisabled = !warehouseDef || slotsBlocked;
  const ctaLabel = !warehouseDef
    ? 'Warehouse not yet available'
    : slotsBlocked
      ? 'No building slots available'
      : '🏗️ Build a Warehouse';

  return (
    <OutpostCard accent="warehouse">
      <OutpostCardTitle accent="warehouse">WAREHOUSE</OutpostCardTitle>
      {hasWarehouse ? (
        storageItems.length > 0 ? (
          <div className="flex flex-col gap-2.5">
            {storageItems.map((res) => {
              const pct = res.capacity > 0 ? Math.min((res.current / res.capacity) * 100, 100) : 0;
              const isFull = pct >= 99.5;
              const resSummary = resourceSummaries.find(
                (s) => s.outputRefId === res.outputRefId && s.outputType === res.outputType,
              );
              const netRate = resSummary?.netRatePerHour ?? 0;
              const isDepleting = netRate < 0;
              let depletionLabel = '';
              if (isDepleting) {
                const invAmount = computeInventoryAmount(res.outputType, res.outputRefId, syncItems, currencyBalances);
                const totalAvailable = res.current + invAmount;
                const hoursLeft = totalAvailable / Math.abs(netRate);
                depletionLabel = formatTimeRemaining(hoursLeft);
              }
              const barClass = isDepleting
                ? 'bg-gradient-to-r from-[#ef4444] to-[#dc2626] animate-[deplete-pulse_2s_ease-in-out_infinite]'
                : isFull
                  ? 'bg-gradient-to-r from-[#f59e0b] to-[#d97706]'
                  : 'bg-gradient-to-r from-[#fbbf24] to-[#f59e0b]';
              return (
                <div
                  key={res.key}
                  className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg bg-white/[0.025] border border-white/[0.05]"
                >
                  <span className="flex-shrink-0 text-lg">
                    <GameIcon src={resolveIcon(res.outputType, res.outputRefId, currencyDefs, itemDefs)} size={16} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-semibold text-[#f1f5f9] mb-1.5 truncate">
                      {resolveName(res.outputType, res.outputRefId, currencyDefs, itemDefs)}
                    </div>
                    <div className="h-1.5 rounded-full bg-black/45 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-[width] duration-[400ms] ${barClass}`}
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                    {isDepleting && (
                      <div className="text-[10px] text-[#fbbf24] mt-1 font-bold">⚠ {depletionLabel} left</div>
                    )}
                  </div>
                  <span className="text-[11px] font-bold text-[#fcd34d] whitespace-nowrap">
                    {formatAmount(res.current)} / {formatAmount(res.capacity)}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState message="No resources stored yet." />
        )
      ) : (
        <EmptyState
          message="No warehouse on this outpost. Build one to unlock storage capacity for stockpiling resources."
          action={
            <button
              disabled={ctaDisabled}
              onClick={() => !ctaDisabled && warehouseDef && onBuild(warehouseDef)}
              className="px-5 py-2.5 rounded-full text-[#1f1206] text-[13px] font-extrabold tracking-wide border border-[rgba(252,211,77,0.5)] shadow-[0_6px_16px_-8px_rgba(245,158,11,0.7)] transition-[filter] hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
              style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}
            >
              {ctaLabel}
            </button>
          }
        />
      )}
    </OutpostCard>
  );
}
