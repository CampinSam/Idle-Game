import { useRef, useState } from 'react';
import { useAppSelector } from '../../../../../store';
import { useCommand } from '../../../../../hooks/useCommand';
import { audioEngine } from '../../../../../services/AudioEngine';
import { resolveIcon, resolveName } from '../../../../../utils/iconResolver';
import GameIcon from '../../../../../components/GameIcon';
import BuildingProgressBar from '../../../../../components/BuildingProgressBar';
import LootPop, { type LootPopItem } from '../../../../../components/LootPop';
import { EmptyState, OutpostCard, OutpostCardTitle } from '../../../../../components/ui';
import {
  formatRate,
  formatAmount,
  formatTimeRemaining,
  computeInventoryAmount,
} from '../../../../../utils/locationProduction';

interface OutpostProductionCardProps {
  outpost: any;
  resourceSummaries: any[];
  hasActivity: boolean;
  effectiveRatePerHour: number;
  constructingBuildings: any[];
  locationJobs: any[];
  tickRate: number;
  storedResources: number[];
  onCompleteBuilding: (id: string) => void;
}

export function OutpostProductionCard({
  outpost,
  resourceSummaries,
  hasActivity,
  effectiveRatePerHour,
  constructingBuildings,
  locationJobs,
  tickRate,
  storedResources,
  onCompleteBuilding,
}: OutpostProductionCardProps) {
  const { execute } = useCommand();
  const currencyDefs = useAppSelector((s) => s.game.currencyDefs);
  const itemDefs = useAppSelector((s) => s.game.itemDefs);
  const syncItems = useAppSelector((s) => s.sync.items);
  const currencyBalances = useAppSelector((s) => s.sync.currencyBalances);

  const [claiming, setClaiming] = useState(false);
  const [lootPopItems, setLootPopItems] = useState<LootPopItem[]>([]);
  const lootPopKey = useRef(0);

  const hasClaimable =
    resourceSummaries.some((res) => Math.floor(res.currentAmount) >= 1) ||
    storedResources.some((v) => Math.floor(Number(v)) >= 1);

  const handleClaim = async () => {
    if (!outpost.id || claiming) return;
    setClaiming(true);
    setLootPopItems([]);

    const snapshot = resourceSummaries
      .map((res): LootPopItem | null => {
        const amount = res.currentAmount;
        const floored = Math.floor(amount);
        if (floored < 1) return null;
        const name = resolveName(res.outputType, res.outputRefId, currencyDefs, itemDefs);
        return {
          key: res.key,
          icon: <GameIcon src={resolveIcon(res.outputType, res.outputRefId, currencyDefs, itemDefs)} size={16} />,
          label: `+${formatAmount(floored)} ${name}`,
        };
      })
      .filter((item): item is LootPopItem => item !== null);

    try {
      await execute('ClaimLocation', { locationId: outpost.id });
      audioEngine.play('sfx.location.claim');
      audioEngine.play('sfx.economy.currency_earn');
      if (snapshot.length > 0) {
        lootPopKey.current += 1;
        setLootPopItems(snapshot);
      }
    } catch (err: any) {
      audioEngine.play('ui.error');
      alert('Claim failed: ' + (err.message || 'Unknown error'));
    } finally {
      setClaiming(false);
    }
  };

  return (
    <OutpostCard accent="production">
      <OutpostCardTitle accent="production">PRODUCTION</OutpostCardTitle>
      {resourceSummaries.length > 0 && (
        <>
          {hasActivity ? (
            <div className="flex items-baseline gap-1.5 mb-2.5">
              <span
                className={`font-cinzel text-[26px] font-black [text-shadow:0_0_18px_rgba(16,185,129,0.4)] ${
                  effectiveRatePerHour < 0
                    ? 'text-[#f87171] [text-shadow:0_0_18px_rgba(239,68,68,0.35)]'
                    : 'text-[#34d399]'
                }`}
              >
                {effectiveRatePerHour >= 0 ? '+' : ''}{formatRate(effectiveRatePerHour)}/h
              </span>
            </div>
          ) : (
            <EmptyState message="No active generators." />
          )}
          <div className="flex flex-col gap-1.5 mb-3">
            {resourceSummaries.map((res) => {
              const isFull = res.capacity > 0 && res.currentAmount / res.capacity >= 0.995;
              const isDepleting = res.netRatePerHour < 0;
              let depletionLabel = '';
              if (isDepleting) {
                const invAmount = computeInventoryAmount(res.outputType, res.outputRefId, syncItems, currencyBalances);
                const totalAvailable = res.currentAmount + invAmount;
                const hoursLeft = totalAvailable / Math.abs(res.netRatePerHour);
                depletionLabel = formatTimeRemaining(hoursLeft);
              }
              return (
                <div
                  key={res.key}
                  className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border ${
                    isDepleting
                      ? 'bg-[rgba(239,68,68,0.07)] border-[rgba(239,68,68,0.18)]'
                      : 'bg-white/[0.03] border-white/[0.05]'
                  }`}
                >
                  <span className="flex-shrink-0">
                    <GameIcon src={resolveIcon(res.outputType, res.outputRefId, currencyDefs, itemDefs)} size={16} />
                  </span>
                  <span className="flex-1 min-w-0 text-[12px] text-text-primary truncate">
                    {resolveName(res.outputType, res.outputRefId, currencyDefs, itemDefs)}
                  </span>
                  {isFull ? (
                    <span className="text-[10px] font-extrabold tracking-wide text-[#fcd34d] bg-[rgba(245,158,11,0.14)] px-2 py-0.5 rounded-md">
                      Full
                    </span>
                  ) : isDepleting ? (
                    <>
                      <span className="text-[11px] font-bold text-[#f87171] bg-[rgba(239,68,68,0.12)] px-2 py-0.5 rounded-md">
                        {formatRate(res.netRatePerHour)}/h
                      </span>
                      <span className="text-[10px] font-bold text-[#fbbf24] ml-1.5">⚠ {depletionLabel}</span>
                    </>
                  ) : (
                    <span className="text-[11px] font-bold text-[#34d399] bg-[rgba(16,185,129,0.12)] px-2 py-0.5 rounded-md">
                      +{formatRate(res.netRatePerHour)}/h
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
      {resourceSummaries.length === 0 && <EmptyState message="No active generators." />}
      {constructingBuildings.length > 0 && (
        <div className="flex flex-col gap-2 mt-2.5 pt-2.5 border-t border-dashed border-[rgba(245,158,11,0.28)]">
          <div className="text-[10px] font-extrabold tracking-[0.08em] uppercase text-[#fbbf24]">Construction</div>
          {constructingBuildings.map((b: any) => (
            <BuildingProgressBar
              key={b.id}
              name={b.name}
              startTick={b.startTick}
              durationTicks={b.durationTicks}
              tickRate={tickRate}
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
              name={(j.name || j.defId || j.recipeId || j.type || 'Job').toString().replace(/_/g, ' ')}
              startTick={j.startTick}
              durationTicks={j.durationTicks}
              tickRate={tickRate}
            />
          ))}
        </div>
      )}
      <div className="relative mt-3">
        <LootPop
          key={lootPopKey.current}
          items={lootPopItems}
          durationMs={1500}
          onComplete={() => setLootPopItems([])}
        />
        <button
          onClick={handleClaim}
          disabled={!hasClaimable || claiming}
          className="w-full px-5 py-2.5 rounded-xl text-white text-[13px] font-extrabold tracking-[0.06em] uppercase border border-[rgba(52,211,153,0.35)] cursor-pointer hover:brightness-110 active:translate-y-px disabled:opacity-45 disabled:cursor-not-allowed disabled:shadow-none shadow-[0_0_0_1px_rgba(0,0,0,0.2)_inset,0_6px_16px_-8px_rgba(16,185,129,0.7)]"
          style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
        >
          {claiming ? 'Collecting...' : 'Collect'}
        </button>
      </div>
    </OutpostCard>
  );
}
