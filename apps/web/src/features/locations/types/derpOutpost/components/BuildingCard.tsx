import { useNavigate } from 'react-router-dom';
import { useAppDispatch } from '../../../../../store';
import { api } from '../../../../../services/api';
import { audioEngine } from '../../../../../services/AudioEngine';
import { patchBuildingEnabled } from '../../../../../store/syncSlice';
import { resolveIcon, resolveName } from '../../../../../utils/iconResolver';
import BuildingProgressBar from '../../../../../components/BuildingProgressBar';
import ItemQty from '../../../../../components/ItemQty';
import { getBuildingCategoryDisplay } from '@derp/shared';
import { OutpostCard } from '../../../../../components/ui';

interface BuildingCardProps {
  outpostId: string;
  building: any;
  resourceSummaries: any[];
  currencyDefs: any[];
  itemDefs: any[];
  tickRate: number;
  onCompleteBuilding: (buildingId: string) => void;
  onUpgradeClick: (building: any) => void;
}

export default function BuildingCard({
  outpostId,
  building: b,
  resourceSummaries,
  currencyDefs,
  itemDefs,
  tickRate,
  onCompleteBuilding,
  onUpgradeClick,
}: BuildingCardProps) {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();

  const handleToggleBuilding = async () => {
    const currentEnabled = b.enabled !== false;
    const newEnabled = !currentEnabled;
    dispatch(patchBuildingEnabled({ locationId: outpostId, buildingId: b.id, enabled: newEnabled }));
    audioEngine.play('sfx.building.toggle');
    try {
      await api.toggleBuilding(outpostId, b.id, newEnabled);
    } catch {
      dispatch(patchBuildingEnabled({ locationId: outpostId, buildingId: b.id, enabled: currentEnabled }));
    }
  };

  const currencyIds = new Set(currencyDefs.map((c: any) => c.id));
  const catIcon = getBuildingCategoryDisplay(b.category).icon;
  const isBuilding = b.status === 'building';
  const genEntry = resourceSummaries
    .flatMap((r: any) => r.generators)
    .find((g: any) => g.buildingId === b.id);
  const isMaxLevel = b.level >= (b.maxLevel ?? 50);
  const isEnabled = b.enabled !== false;
  const showToggle = !isBuilding && b.category !== 'STORAGE';

  const headerBorder = isBuilding
    ? 'border-b border-[rgba(245,158,11,0.28)]'
    : 'border-b border-[rgba(139,92,246,0.12)]';
  const metaTone = !isEnabled && !isBuilding ? 'text-[#f87171]' : 'text-[#34d399]';

  return (
    <OutpostCard accent="building" className="hover:border-[rgba(139,92,246,0.32)]">
      <div className={`flex items-center gap-3 pb-2.5 mb-2.5 ${headerBorder}`}>
        <span className="flex-shrink-0 w-[42px] h-[42px] flex items-center justify-center text-[26px] rounded-lg bg-[rgba(139,92,246,0.12)] border border-[rgba(139,92,246,0.25)]">
          {catIcon}
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-extrabold text-[#f5f3ff] tracking-[0.02em] truncate">{b.name}</div>
          <div className={`text-[11px] font-semibold tracking-wide mt-0.5 ${metaTone}`}>
            {isBuilding ? (
              'Under Construction'
            ) : (
              <>Level {b.level}{b.maxLevel ? ` / ${b.maxLevel}` : ''} &middot; {isEnabled ? 'Active' : 'Disabled'}</>
            )}
          </div>
        </div>
        {showToggle && (
          <button
            type="button"
            onClick={handleToggleBuilding}
            title={isEnabled ? 'Disable building' : 'Enable building'}
            className="flex-shrink-0 p-1 cursor-pointer"
          >
            <span
              className={`relative inline-block w-9 h-5 rounded-full transition-colors ${
                isEnabled ? 'bg-[rgba(52,211,153,0.45)]' : 'bg-white/15'
              }`}
            >
              <span
                className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-[left] ${
                  isEnabled ? 'left-[18px]' : 'left-0.5'
                }`}
              />
            </span>
          </button>
        )}
        {!isBuilding && !isMaxLevel && (
          <button
            onClick={() => onUpgradeClick(b)}
            className="flex-shrink-0 px-3 py-1 rounded-full text-[11px] font-extrabold tracking-wide uppercase text-[#c4b5fd] bg-[rgba(139,92,246,0.18)] border border-[rgba(167,139,250,0.45)] hover:brightness-110 cursor-pointer"
          >
            Upgrade
          </button>
        )}
      </div>

      {isBuilding && (
        <BuildingProgressBar
          name={b.name}
          startTick={b.startTick}
          durationTicks={b.durationTicks}
          tickRate={tickRate}
          isUpgrade={!!b.jobData?.upgradeToLevel}
          onComplete={() => onCompleteBuilding(b.id)}
        />
      )}

      {!isBuilding && b.category === 'GENERATOR' && (
        <div className={`flex flex-col gap-1.5 ${!isEnabled ? 'opacity-45' : ''}`}>
          <div className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg bg-white/[0.03] border border-white/[0.05]">
            <span className="text-[12px] text-text-primary truncate">
              {resolveName(b.outputType, b.outputRefId, currencyDefs, itemDefs)}
            </span>
            <ItemQty
              src={resolveIcon(b.outputType, b.outputRefId, currencyDefs, itemDefs)}
              amount={genEntry ? genEntry.ratePerHour : Number(b.resourcePerHour)}
              format="rate"
              prefix="+"
              suffix="/h"
              size={16}
              className="text-[12px] text-[#34d399] font-bold"
            />
          </div>
          {b.consumptionRates && Object.entries(b.consumptionRates as Record<string, number>).map(([resourceId, rate]) => {
            const cOutputType = currencyIds.has(resourceId) ? 'CURRENCY' : 'ITEM';
            return (
              <div
                key={resourceId}
                className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg bg-[rgba(239,68,68,0.05)] border border-[rgba(239,68,68,0.15)]"
              >
                <span className="text-[12px] text-text-primary truncate">
                  {resolveName(cOutputType, resourceId, currencyDefs, itemDefs)}
                </span>
                <ItemQty
                  src={resolveIcon(cOutputType, resourceId, currencyDefs, itemDefs)}
                  amount={Number(rate)}
                  format="rate"
                  prefix="-"
                  suffix="/h"
                  size={16}
                  className="text-[12px] text-[#f87171] font-bold"
                />
              </div>
            );
          })}
        </div>
      )}

      {!isBuilding && b.category === 'WORKSHOP' && (
        <div className="flex flex-col gap-3">
          <p className="text-[13px] text-text-secondary leading-relaxed m-0">
            Step inside The Forge to brew, smith, and enchant. Server-side luck shapes the gear quality you'll pull from the crucible.
          </p>
          <button
            type="button"
            onClick={() => navigate(`/locations/${outpostId}/workshop`)}
            disabled={!isEnabled}
            className="self-start px-4 py-2 rounded-full text-white text-[13px] font-extrabold tracking-wide uppercase bg-gradient-to-br from-[#f59e0b] to-[#d97706] border border-[rgba(252,211,77,0.45)] hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            ⚒️  Open The Forge
          </button>
        </div>
      )}

      {!isBuilding && b.category === 'STORAGE' && (
        <div className="flex flex-col gap-2">
          <div className="text-[11px] font-extrabold tracking-[0.06em] uppercase text-text-secondary">
            Storage Capacity Added
          </div>
          {Object.entries(b.storageContributions || {}).length > 0 ? (
            Object.entries(b.storageContributions as Record<string, number>).map(([resourceId, cap]) => {
              const outputType = currencyIds.has(resourceId) ? 'CURRENCY' : 'ITEM';
              return (
                <div
                  key={resourceId}
                  className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg bg-white/[0.03] border border-white/[0.05]"
                >
                  <span className="text-[12px] text-text-primary truncate">
                    {resolveName(outputType, resourceId, currencyDefs, itemDefs)}
                  </span>
                  <ItemQty
                    src={resolveIcon(outputType, resourceId, currencyDefs, itemDefs)}
                    amount={Number(cap)}
                    format="compact"
                    prefix="+"
                    size={16}
                    className="text-[12px] text-[#fcd34d] font-bold"
                  />
                </div>
              );
            })
          ) : (
            <div className="text-[12px] text-text-secondary px-2.5 py-2">No capacity contributions</div>
          )}
        </div>
      )}
    </OutpostCard>
  );
}
