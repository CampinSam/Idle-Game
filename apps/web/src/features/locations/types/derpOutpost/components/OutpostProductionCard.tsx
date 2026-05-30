import { useAppSelector } from '../../../../../store';
import { resolveIcon, resolveName } from '../../../../../utils/iconResolver';
import GameIcon from '../../../../../components/GameIcon';
import BuildingProgressBar from '../../../../../components/BuildingProgressBar';
import { Divider, EmptyState, OutpostCard, OutpostCardTitle } from '../../../../../components/ui';
import { formatRate, formatTimeRemaining, computeInventoryAmount } from '../../../../../utils/locationProduction';
import { useNow } from '../../../../../hooks/useNow';

interface OutpostProductionCardProps {
  outpost: any;
  resourceSummaries: any[];
  hasActivity: boolean;
  constructingBuildings: any[];
  locationJobs: any[];
  onCompleteBuilding: (id: string) => void;
}

export function OutpostProductionCard({
  outpost,
  resourceSummaries,
  hasActivity,
  constructingBuildings,
  locationJobs,
  onCompleteBuilding,
}: OutpostProductionCardProps) {
  const currencyDefs = useAppSelector((s) => s.game.currencyDefs);
  const itemDefs = useAppSelector((s) => s.game.itemDefs);
  const syncItems = useAppSelector((s) => s.sync.items);
  const currencyBalances = useAppSelector((s) => s.sync.currencyBalances);

  const now = useNow(1000);
  const lastSettledAt: string | null = (outpost as any)?.storage?.lastSettledAt ?? null;
  const elapsedSecs = lastSettledAt ? Math.max(0, (now - Date.parse(lastSettledAt)) / 1000) : 0;

  const productionSummaries = resourceSummaries.filter((r) => r.totalRatePerHour > 0);
  const consumptionOnlySummaries = resourceSummaries.filter(
    (r) => r.totalRatePerHour === 0 && r.netRatePerHour < 0,
  );
  const allRows = [...productionSummaries, ...consumptionOnlySummaries];

  return (
    <OutpostCard accent="production" className="flex flex-col">
      <OutpostCardTitle accent="production">PRODUCTION</OutpostCardTitle>

      {allRows.length === 0 && !hasActivity && (
        <EmptyState message="No active generators." />
      )}

      {allRows.length > 0 && (
        <div className="flex flex-col mb-3">
          {allRows.map((res, idx) => {
            const isProduction = res.totalRatePerHour > 0;
            const isDepleting = res.netRatePerHour < 0;
            const cycleSeconds = isProduction && res.totalRatePerHour > 0
              ? 3600 / res.totalRatePerHour
              : 0;
            const barPct = cycleSeconds > 0
              ? ((elapsedSecs % cycleSeconds) / cycleSeconds) * 100
              : 0;

            let depletionLabel = '';
            if (isDepleting) {
              const invAmount = computeInventoryAmount(
                res.outputType,
                res.outputRefId,
                syncItems,
                currencyBalances,
              );
              const totalAvailable = res.currentAmount + invAmount;
              const hoursLeft = totalAvailable / Math.abs(res.netRatePerHour);
              depletionLabel = formatTimeRemaining(hoursLeft);
            }

            const icon = resolveIcon(res.outputType, res.outputRefId, currencyDefs, itemDefs);
            const name = resolveName(res.outputType, res.outputRefId, currencyDefs, itemDefs);

            return (
              <div key={res.key}>
                {idx > 0 && <Divider className="my-2" />}

                {isProduction ? (
                  <div className="px-0.5 py-1">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <span className="flex-shrink-0">
                        <GameIcon src={icon} size={14} />
                      </span>
                      <span className="flex-1 min-w-0 text-[12px] font-semibold text-text-primary truncate">
                        {name}
                      </span>
                      <span
                        className={`text-[10px] font-bold whitespace-nowrap ${
                          isDepleting ? 'text-[#f87171]' : 'text-[#86efac]'
                        }`}
                      >
                        {isDepleting ? '' : '+'}
                        {formatRate(res.netRatePerHour)}/h
                      </span>
                    </div>
                    <div className="h-1 rounded-full bg-black/40 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[#10b981] to-[#34d399] transition-none"
                        style={{ width: `${Math.min(barPct, 100)}%` }}
                      />
                    </div>
                    {isDepleting && depletionLabel && (
                      <div className="text-[10px] text-[#fbbf24] mt-1 font-bold">
                        ⚠ {depletionLabel} left
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 px-0.5 py-1">
                    <span className="flex-shrink-0">
                      <GameIcon src={icon} size={14} />
                    </span>
                    <span className="flex-1 min-w-0 text-[12px] font-semibold text-[#f87171] truncate">
                      {name}
                    </span>
                    <span className="text-[10px] font-bold text-[#f87171] whitespace-nowrap">
                      {formatRate(res.netRatePerHour)}/h
                    </span>
                    {depletionLabel && (
                      <span className="text-[10px] font-bold text-[#fbbf24] ml-1">
                        ⚠ {depletionLabel}
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {constructingBuildings.length > 0 && (
        <div className="flex flex-col gap-2 mt-auto pt-2.5 border-t border-dashed border-[rgba(245,158,11,0.28)]">
          <div className="text-[10px] font-extrabold tracking-[0.08em] uppercase text-[#fbbf24]">
            Construction
          </div>
          {constructingBuildings.map((b: any) => (
            <BuildingProgressBar
              key={b.id}
              name={b.name}
              startTick={b.startTick}
              durationTicks={b.durationTicks}
              isUpgrade={!!b.jobData?.upgradeToLevel}
              onComplete={() => onCompleteBuilding(b.id)}
            />
          ))}
        </div>
      )}

      {locationJobs.length > 0 && (
        <div className="flex flex-col gap-2 mt-2.5 pt-2.5 border-t border-dashed border-[rgba(245,158,11,0.28)]">
          <div className="text-[10px] font-extrabold tracking-[0.08em] uppercase text-[#fbbf24]">
            {locationJobs.some((j: any) => j.type === 'CraftingJob') ? 'Crafting' : 'Active Jobs'}
          </div>
          {locationJobs.map((j: any) => (
            <BuildingProgressBar
              key={j.id}
              name={(j.name || j.recipeId || j.type || 'Job').toString().replace(/_/g, ' ')}
              startTick={j.startTick}
              durationTicks={j.durationTicks}
            />
          ))}
        </div>
      )}
    </OutpostCard>
  );
}
