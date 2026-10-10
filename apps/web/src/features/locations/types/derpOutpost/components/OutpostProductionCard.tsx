import { useAppSelector } from '../../../../../store';
import { resolveIcon, resolveName } from '../../../../../utils/iconResolver';
import GameIcon from '../../../../../components/GameIcon';
import BuildingProgressBar from '../../../../../components/BuildingProgressBar';
import { Divider, EmptyState, OutpostCard, OutpostCardTitle } from '../../../../../components/ui';
import { formatRate, formatTimeRemaining, computeInventoryAmount } from '../../../../../utils/locationProduction';
import { useNow } from '../../../../../hooks/useNow';
import { useProgressAnimation } from '../../../../../hooks/useProgressAnimation';

function ProductionCycleBar({
  cycleSeconds,
  elapsedSecs,
}: {
  cycleSeconds: number;
  elapsedSecs: number;
}) {
  const cycleElapsed = cycleSeconds > 0 ? elapsedSecs % cycleSeconds : 0;
  const barPct = cycleSeconds > 0 ? (cycleElapsed / cycleSeconds) * 100 : 0;
  const remainingMs = cycleSeconds > 0 ? (cycleSeconds - cycleElapsed) * 1000 : Infinity;
  const cycleIndex = cycleSeconds > 0 ? Math.floor(elapsedSecs / cycleSeconds) : 0;
  const fillStyle = useProgressAnimation(barPct, remainingMs, cycleIndex);

  return (
    <div className="h-1 rounded-full bg-black/40 overflow-hidden">
      <div
        className="h-full rounded-full bg-gradient-to-r from-[#10b981] to-[#34d399]"
        style={fillStyle}
      />
    </div>
  );
}

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

  const productionGroups = resourceSummaries.filter((r) => r.totalRatePerHour > 0);
  const consumptionOnly = resourceSummaries.filter(
    (r) => r.totalRatePerHour === 0 && r.netRatePerHour < 0,
  );

  const allGroups = [
    ...productionGroups.map((r) => ({ type: 'production' as const, summary: r })),
    ...consumptionOnly.map((r) => ({ type: 'consumption' as const, summary: r })),
  ];

  return (
    <OutpostCard accent="production" className="flex flex-col">
      <OutpostCardTitle accent="production">PRODUCTION</OutpostCardTitle>

      {allGroups.length === 0 && !hasActivity && (
        <EmptyState message="No active generators." />
      )}

      {allGroups.length > 0 && (
        <div className="flex flex-col mb-3">
          {allGroups.map((group, idx) => {
            const res = group.summary;
            const icon = resolveIcon(res.outputType, res.outputRefId, currencyDefs, itemDefs);
            const name = resolveName(res.outputType, res.outputRefId, currencyDefs, itemDefs);

            if (group.type === 'production') {
              const grossRate = res.totalRatePerHour;
              const consumed = grossRate - res.netRatePerHour;
              const hasConsumptionSubRow = consumed > 0;

              const cycleSeconds = grossRate > 0 ? 3600 / grossRate : 0;

              return (
                <div key={res.key}>
                  {idx > 0 && <Divider className="my-2" />}

                  <div className="px-0.5 py-1">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <span className="flex-shrink-0">
                        <GameIcon src={icon} size={14} />
                      </span>
                      <span className="flex-1 min-w-0 text-[12px] font-semibold text-text-primary truncate">
                        {name}
                      </span>
                      <span className="text-[10px] font-bold whitespace-nowrap text-[#86efac]">
                        +{formatRate(grossRate)}/h
                      </span>
                    </div>
                    <ProductionCycleBar cycleSeconds={cycleSeconds} elapsedSecs={elapsedSecs} />
                  </div>

                  {hasConsumptionSubRow && (
                    <div className="flex items-center gap-1.5 px-0.5 pb-1 pt-0.5 ml-1 opacity-80">
                      <span className="flex-shrink-0">
                        <GameIcon src={icon} size={12} />
                      </span>
                      <span className="flex-1 min-w-0 text-[10px] font-medium text-[#f87171] truncate">
                        {name}
                      </span>
                      <span className="text-[10px] font-bold whitespace-nowrap text-[#f87171]">
                        -{formatRate(consumed)}/h
                      </span>
                    </div>
                  )}
                </div>
              );
            }

            const invAmount = computeInventoryAmount(
              res.outputType,
              res.outputRefId,
              syncItems,
              currencyBalances,
            );
            const totalAvailable = res.currentAmount + invAmount;
            const hoursLeft = totalAvailable / Math.abs(res.netRatePerHour);
            const depletionLabel = formatTimeRemaining(hoursLeft);

            return (
              <div key={res.key}>
                {idx > 0 && <Divider className="my-2" />}
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
