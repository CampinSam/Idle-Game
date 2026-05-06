import { useNavigate } from 'react-router-dom';
import { useAppDispatch } from '../../../../../store';
import { api } from '../../../../../services/api';
import { audioEngine } from '../../../../../services/AudioEngine';
import { patchBuildingEnabled } from '../../../../../store/syncSlice';
import { resolveIcon, resolveName } from '../../../../../utils/iconResolver';
import BuildingProgressBar from '../../../../../components/BuildingProgressBar';
import ItemQty from '../../../../../components/ItemQty';
import { getBuildingCategoryDisplay } from '@derp/shared';

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

  return (
    <div className="od-card od-building-card">
      <div className={`facility-card-header ${isBuilding ? 'under-construction' : ''}`}>
        <span className="facility-card-icon">{catIcon}</span>
        <div className="facility-card-info">
          <div className="facility-card-name">{b.name}</div>
          <div className={`facility-card-meta ${!isEnabled && !isBuilding ? 'meta-disabled' : ''}`}>
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
            className={`facility-toggle ${isEnabled ? 'enabled' : 'disabled'}`}
            onClick={handleToggleBuilding}
            title={isEnabled ? 'Disable building' : 'Enable building'}
          >
            <span className="facility-toggle-track">
              <span className="facility-toggle-thumb" />
            </span>
          </button>
        )}
        {!isBuilding && !isMaxLevel && (
          <button className="facility-upgrade-pill" onClick={() => onUpgradeClick(b)}>
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
        <div className={`facility-card-rates ${!isEnabled ? 'rates-disabled' : ''}`}>
          <div className="facility-card-production">
            <span className="facility-prod-name">
              {resolveName(b.outputType, b.outputRefId, currencyDefs, itemDefs)}
            </span>
            <ItemQty
              src={resolveIcon(b.outputType, b.outputRefId, currencyDefs, itemDefs)}
              amount={genEntry ? genEntry.ratePerHour : Number(b.resourcePerHour)}
              format="rate"
              prefix="+"
              suffix="/h"
              size={16}
              className="facility-prod-rate"
            />
          </div>
          {b.consumptionRates && Object.entries(b.consumptionRates as Record<string, number>).map(([resourceId, rate]) => {
            const cOutputType = currencyIds.has(resourceId) ? 'CURRENCY' : 'ITEM';
            return (
              <div key={resourceId} className="facility-card-consumption">
                <span className="facility-consume-name">
                  {resolveName(cOutputType, resourceId, currencyDefs, itemDefs)}
                </span>
                <ItemQty
                  src={resolveIcon(cOutputType, resourceId, currencyDefs, itemDefs)}
                  amount={Number(rate)}
                  format="rate"
                  prefix="-"
                  suffix="/h"
                  size={16}
                  className="facility-consume-rate"
                />
              </div>
            );
          })}
        </div>
      )}

      {!isBuilding && b.category === 'WORKSHOP' && (
        <div className="facility-card-workshop">
          <p className="facility-workshop-blurb">
            Step inside The Forge to brew, smith, and enchant. Server-side luck shapes the gear quality you'll pull from the crucible.
          </p>
          <button
            type="button"
            className="facility-workshop-cta"
            onClick={() => {
              navigate(`/locations/${outpostId}/workshop`);
            }}
            disabled={!isEnabled}
          >
            ⚒️  Open The Forge
          </button>
        </div>
      )}

      {!isBuilding && b.category === 'STORAGE' && (
        <div className="facility-card-storage">
          <div className="facility-storage-header">
            <span className="facility-storage-label">Storage Capacity Added</span>
          </div>
          {Object.entries(b.storageContributions || {}).length > 0 ? (
            Object.entries(b.storageContributions as Record<string, number>).map(([resourceId, cap]) => {
              const outputType = currencyIds.has(resourceId) ? 'CURRENCY' : 'ITEM';
              return (
                <div key={resourceId} className="facility-storage-row">
                  <span className="facility-storage-name">
                    {resolveName(outputType, resourceId, currencyDefs, itemDefs)}
                  </span>
                  <ItemQty
                    src={resolveIcon(outputType, resourceId, currencyDefs, itemDefs)}
                    amount={Number(cap)}
                    format="compact"
                    prefix="+"
                    size={16}
                    className="facility-storage-cap"
                  />
                </div>
              );
            })
          ) : (
            <div className="facility-storage-row">
              <span className="facility-storage-name">No capacity contributions</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
