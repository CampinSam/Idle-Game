import { useState, useEffect, useMemo } from 'react';
import { api } from '../../services/api';
import { resolveIcon, resolveName } from '../../utils/iconResolver';
import GameIcon from '../../components/GameIcon';
import { formatRate, formatAmount } from '../../utils/locationProduction';
import BuildingProgressBar from '../../components/BuildingProgressBar';
import { getBuildingCategoryDisplay } from '@derp/shared';
import './FacilitiesTab.css';

interface FacilitiesTabProps {
  outpostId: string;
  buildings: any[];
  resourceSummaries: any[];
  storageBalances: any[];
  storageCapacity: Record<string, number>;
  currencyDefs: any[];
  itemDefs: any[];
  tickRate: number;
  onBuildClick: (def: any) => void;
  onCompleteBuilding: (buildingId: string) => void;
  onUpgradeClick: (building: any) => void;
}

export default function FacilitiesTab({
  outpostId,
  buildings,
  resourceSummaries,
  storageBalances,
  storageCapacity,
  currencyDefs,
  itemDefs,
  tickRate,
  onBuildClick,
  onCompleteBuilding,
  onUpgradeClick,
}: FacilitiesTabProps) {
  const [activeSubTab, setActiveSubTab] = useState(0);
  const [availableData, setAvailableData] = useState<any>(null);
  const [loadingAvailable, setLoadingAvailable] = useState(false);
  const [slotWarning, setSlotWarning] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadingAvailable(true);
    api.getAvailableBuildings(outpostId)
      .then((data) => {
        if (!cancelled) setAvailableData(data);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingAvailable(false);
      });
    return () => { cancelled = true; };
  }, [outpostId]);

  const currencyIds = useMemo(() => new Set(currencyDefs.map((c: any) => c.id)), [currencyDefs]);

  const slotsAvailable = availableData?.slotsAvailable ?? true;
  const isAddTab = activeSubTab === buildings.length;

  const handleAddTabClick = () => {
    if (!slotsAvailable && availableData) {
      const req = availableData.nextSlotRequirement ?? 'a higher outpost level';
      setSlotWarning(`Requires ${req}`);
      setTimeout(() => setSlotWarning(null), 3000);
      return;
    }
    setActiveSubTab(buildings.length);
  };

  return (
    <div className="od-tab-content">
      <div className="facilities-sub-tabs">
        {buildings.map((b: any, i: number) => (
          <button
            key={b.id}
            className={`facility-sub-tab ${activeSubTab === i ? 'active' : ''} ${b.status === 'building' ? 'constructing' : ''}`}
            onClick={() => setActiveSubTab(i)}
          >
            {b.status === 'building' ? '🔨 ' : ''}{b.name}
          </button>
        ))}
        <button
          className={`facility-sub-tab add-tab ${isAddTab ? 'active' : ''} ${!slotsAvailable ? 'disabled' : ''}`}
          onClick={handleAddTabClick}
        >
          +
        </button>
      </div>

      {slotWarning && (
        <div className="facility-slot-warning">{slotWarning}</div>
      )}

      {!isAddTab && buildings[activeSubTab] && (() => {
        const b = buildings[activeSubTab];
        const catIcon = getBuildingCategoryDisplay(b.category).icon;
        const isBuilding = b.status === 'building';
        const genEntry = resourceSummaries
          .flatMap((r: any) => r.generators)
          .find((g: any) => g.buildingId === b.id);
        const isMaxLevel = b.level >= (b.maxLevel ?? 50);

        return (
          <>
            <div className={`facility-card-header ${isBuilding ? 'under-construction' : ''}`}>
              <span className="facility-card-icon">{catIcon}</span>
              <div className="facility-card-info">
                <div className="facility-card-name">{b.name}</div>
                <div className="facility-card-meta">
                  {isBuilding ? (
                    'Under Construction'
                  ) : (
                    <>Level {b.level}{b.maxLevel ? ` / ${b.maxLevel}` : ''} &middot; {(b.enabled ?? b.isEnabled) ? 'Active' : 'Disabled'}</>
                  )}
                </div>
              </div>
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
              <div className="facility-card-rates">
                <div className="facility-card-production">
                  <span className="facility-prod-icon">
                    <GameIcon src={resolveIcon(b.outputType, b.outputRefId, currencyDefs, itemDefs)} size={16} />
                  </span>
                  <span className="facility-prod-name">
                    {resolveName(b.outputType, b.outputRefId, currencyDefs, itemDefs)}
                  </span>
                  {genEntry && (
                    <span className="facility-prod-rate">+{formatRate(genEntry.ratePerHour)}/h</span>
                  )}
                  {!genEntry && (
                    <span className="facility-prod-rate">+{b.resourcePerHour}/h</span>
                  )}
                </div>
                {b.consumptionRates && Object.entries(b.consumptionRates as Record<string, number>).map(([resourceId, rate]) => {
                  const cOutputType = currencyIds.has(resourceId) ? 'CURRENCY' : 'ITEM';
                  return (
                    <div key={resourceId} className="facility-card-consumption">
                      <span className="facility-consume-icon">
                        <GameIcon src={resolveIcon(cOutputType, resourceId, currencyDefs, itemDefs)} size={16} />
                      </span>
                      <span className="facility-consume-name">
                        {resolveName(cOutputType, resourceId, currencyDefs, itemDefs)}
                      </span>
                      <span className="facility-consume-rate">-{formatRate(Number(rate))}/h</span>
                    </div>
                  );
                })}
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
                        <span className="facility-storage-icon">
                          <GameIcon src={resolveIcon(outputType, resourceId, currencyDefs, itemDefs)} size={16} />
                        </span>
                        <span className="facility-storage-name">
                          {resolveName(outputType, resourceId, currencyDefs, itemDefs)}
                        </span>
                        <span className="facility-storage-cap">+{formatAmount(cap)}</span>
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
          </>
        );
      })()}

      {isAddTab && (
        <div className="facilities-available-list">
          {loadingAvailable && (
            <div className="od-empty-tasks">Loading available buildings...</div>
          )}
          {!loadingAvailable && availableData && availableData.available?.length > 0 && (
            availableData.available.map((def: any) => (
              <div key={def.id} className="available-building-card">
                <div className="available-card-top">
                  <span className="available-card-name">{def.name}</span>
                  <button className="build-pill" onClick={() => onBuildClick(def)}>BUILD</button>
                </div>
                <div className="available-card-divider" />
                <div className="available-card-bottom">
                  <span className="available-card-desc">{def.description}</span>
                </div>
              </div>
            ))
          )}
          {!loadingAvailable && (!availableData?.available || availableData.available.length === 0) && (
            <div className="od-empty-tasks">No buildings available to build.</div>
          )}
        </div>
      )}
    </div>
  );
}
