import { useEffect, useState, useRef, useMemo } from 'react';
import { useAppDispatch, useAppSelector } from '../../../../store';
import { fetchCurrencyDefs, fetchItemDefs } from '../../../../store/gameSlice';
import { useSyncEntities, useAllActiveJobs } from '../../../../hooks/useSyncSelectors';
import { useCommand } from '../../../../hooks/useCommand';
import { audioEngine } from '../../../../services/AudioEngine';
import { resolveIcon, resolveName } from '../../../../utils/iconResolver';
import GameIcon from '../../../../components/GameIcon';
import BuildingProgressBar from '../../../../components/BuildingProgressBar';
import { useTickRate } from '../../../../tick';
import { useLocationTimers } from '../../../../hooks/useLocationTimers';
import {
  formatRate,
  formatAmount,
  formatTimeRemaining,
  computeInventoryAmount,
} from '../../../../utils/locationProduction';
import LootPop, { type LootPopItem } from '../../../../components/LootPop';
import { useModal } from '../../../../context/ModalContext';
import { api } from '../../../../services/api';
import { getRegionDisplay } from '@derp/shared';
import BuildingCard from './components/BuildingCard';
import type { LocationPageProps } from '../../registry';
import './DerpOutpostPage.css';

const WAREHOUSE_DEF_ID = 'stor_warehouse';

const CATEGORY_ORDER: Record<string, number> = {
  WORKSHOP: 0,
  GENERATOR: 1,
  STORAGE: 2,
  SUPPORT: 3,
};

export default function DerpOutpostPage({ outpost }: LocationPageProps) {
  const dispatch = useAppDispatch();
  const { execute } = useCommand();
  const { pushModal } = useModal();
  const entities = useSyncEntities();
  const currencyDefs = useAppSelector((s) => s.game.currencyDefs);
  const itemDefs = useAppSelector((s) => s.game.itemDefs);
  const syncItems = useAppSelector((s) => s.sync.items);
  const currencyBalances = useAppSelector((s) => s.sync.currencyBalances);
  const tickRate = useTickRate();
  const locationTimerMap = useLocationTimers();
  const allActiveJobs = useAllActiveJobs();

  const [claiming, setClaiming] = useState(false);
  const [lootPopItems, setLootPopItems] = useState<LootPopItem[]>([]);
  const lootPopKey = useRef(0);
  const [availableData, setAvailableData] = useState<any>(null);
  const [loadingAvailable, setLoadingAvailable] = useState(false);

  const id = outpost.id;

  useEffect(() => {
    if (currencyDefs.length === 0) dispatch(fetchCurrencyDefs());
    if (itemDefs.length === 0) dispatch(fetchItemDefs());
  }, [dispatch, currencyDefs.length, itemDefs.length]);

  useEffect(() => {
    let cancelled = false;
    setLoadingAvailable(true);
    api.getAvailableBuildings(id)
      .then((data) => {
        if (!cancelled) setAvailableData(data);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingAvailable(false);
      });
    return () => { cancelled = true; };
  }, [id]);

  const regionDisplay = getRegionDisplay(outpost.regionId || outpost.region);
  const regionName = regionDisplay.displayName;
  const regionImage = regionDisplay.imagePath;

  const timerData = locationTimerMap.get(id);
  const resourceSummaries = timerData?.resourceSummaries || [];

  const effectiveRatePerHour = resourceSummaries.reduce((s, r) => {
    const isFull = r.capacity > 0 && r.currentAmount / r.capacity >= 0.995;
    return isFull ? s : s + r.netRatePerHour;
  }, 0);

  const hasActivity = resourceSummaries.some(
    (r) => r.totalRatePerHour !== 0 || r.netRatePerHour < 0,
  );

  const buildingsData: any[] = outpost.buildings || [];
  const workersData: any[] = outpost.workers || [];

  const isWarehouse = (b: any) =>
    (b.buildingDefId || b.defId || b.definitionId) === WAREHOUSE_DEF_ID;
  const warehouseBuildings = buildingsData.filter(isWarehouse);
  const hasWarehouse = warehouseBuildings.length > 0;
  const nonWarehouseBuildings = buildingsData.filter((b: any) => !isWarehouse(b));

  const sortedBuildings = useMemo(
    () =>
      [...nonWarehouseBuildings].sort((a: any, b: any) => {
        const oa = CATEGORY_ORDER[a.category] ?? 99;
        const ob = CATEGORY_ORDER[b.category] ?? 99;
        if (oa !== ob) return oa - ob;
        return (a.name || '').localeCompare(b.name || '');
      }),
    [nonWarehouseBuildings],
  );

  const constructingBuildings = buildingsData.filter(
    (b: any) => b.status === 'building' && b.startTick != null && b.durationTicks != null,
  );

  const locationJobs = useMemo(
    () =>
      allActiveJobs.filter(
        (j: any) =>
          (j.data?.locationId || j.locationId) === id &&
          j.type !== 'BuildingJob' &&
          j.startTick != null &&
          j.durationTicks != null,
      ),
    [allActiveJobs, id],
  );

  const storedResources = Object.values((outpost.storage?.stored as Record<string, number>) || {});
  const hasClaimable =
    resourceSummaries.some((res) => Math.floor(res.currentAmount) >= 1) ||
    storedResources.some((v) => Math.floor(Number(v)) >= 1);

  const assignedEntityIds = workersData.map((w: any) => w.entityId);
  const assignedEntities = entities.filter((b: any) => assignedEntityIds.includes(b.id));

  const allWarehouseStorageItems = useMemo(() => {
    const capacityMap = (outpost?.storage?.capacity as Record<string, number>) || {};
    const storedMap = (outpost?.storage?.stored as Record<string, number>) || {};
    const currencyIdSet = new Set(currencyDefs.map((c: any) => c.id));

    const seen = new Set<string>();
    const items: Array<{
      key: string;
      outputType: string;
      outputRefId: string;
      current: number;
      capacity: number;
    }> = [];

    for (const res of resourceSummaries) {
      seen.add(res.outputRefId);
      items.push({
        key: res.key,
        outputType: res.outputType,
        outputRefId: res.outputRefId,
        current: res.currentAmount,
        capacity: res.capacity,
      });
    }

    for (const [resId, cap] of Object.entries(capacityMap)) {
      if (!seen.has(resId) && Number(cap) > 0) {
        const outputType = currencyIdSet.has(resId) ? 'CURRENCY' : 'ITEM';
        items.push({
          key: `${outputType}:${resId}`,
          outputType,
          outputRefId: resId,
          current: Number(storedMap[resId] ?? 0),
          capacity: Number(cap),
        });
      }
    }

    return items;
  }, [outpost, resourceSummaries, currencyDefs]);

  const handleClaim = async () => {
    if (!id || claiming) return;
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
      audioEngine.play('ui.button_click');
      await execute('ClaimLocation', { locationId: id });
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

  const handleCompleteBuilding = async (buildingId: string) => {
    try {
      await execute('CompleteBuilding', { locationId: id, buildingId });
    } catch (err: any) {
      console.error('Failed to complete building:', err);
    }
  };

  const openBuildModal = async (def: any) => {
    try {
      const spec = await api.getModalSpec({ buildingDefId: def.id, locationId: id });
      if (spec?.version === 1) {
        pushModal(spec);
      } else {
        alert('Could not load build details. Please try again.');
      }
    } catch (err: any) {
      alert(err.message || 'Could not load build details. Please try again.');
    }
  };

  const openUpgradeModal = async (building: any) => {
    try {
      const buildingDefId = building.buildingDefId || building.defId || building.definitionId;
      const spec = await api.getModalSpec({ buildingDefId, locationId: id, buildingId: building.id });
      if (spec?.version === 1) pushModal(spec);
    } catch (err: any) {
      console.error('[DerpOutpostPage] Failed to load upgrade modal:', err);
    }
  };

  const warehouseDef = useMemo(
    () => (availableData?.available || []).find((def: any) => def.id === WAREHOUSE_DEF_ID),
    [availableData],
  );

  return (
    <div className="od-tab-content od-card-stack">
      <div className="od-card od-card-header">
        <div className="od-hero-image">
          <img src={regionImage} alt={regionName} />
        </div>
        <div className="od-header-info od-header-info-stacked">
          <h1 className="od-name">
            {outpost.name || 'Outpost'}
            <span className="od-name-region"> &bull; {regionName}</span>
          </h1>
          <div className="od-badges">
            <span className="od-level-badge">Level {outpost.level}</span>
          </div>
          {outpost.xp != null && (
            <div className="od-xp-bar-wrap">
              <div className="od-xp-bar-track">
                <div
                  className="od-xp-bar-fill"
                  style={{ width: `${Math.min(100, Math.max(0, Number(outpost.xp || 0) % 100))}%` }}
                />
              </div>
              <span className="od-xp-bar-label">XP {formatAmount(Number(outpost.xp || 0))}</span>
            </div>
          )}
        </div>
      </div>

      <div className="od-card od-card-timers">
        <h3 className="od-card-title">TIMERS</h3>
        {resourceSummaries.length > 0 && (
          <>
            {hasActivity ? (
              <div className="od-prod-rate">
                <span className={`od-prod-value ${effectiveRatePerHour < 0 ? 'negative' : ''}`}>
                  {effectiveRatePerHour >= 0 ? '+' : ''}{formatRate(effectiveRatePerHour)}/h
                </span>
              </div>
            ) : (
              <div className="od-empty-tasks">No active generators.</div>
            )}
            <div className="od-prod-resources">
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
                  <div key={res.key} className={`od-prod-res ${isDepleting ? 'depleting' : ''}`}>
                    <span className="od-prod-res-icon">
                      <GameIcon src={resolveIcon(res.outputType, res.outputRefId, currencyDefs, itemDefs)} size={16} />
                    </span>
                    <span className="od-prod-res-name">
                      {resolveName(res.outputType, res.outputRefId, currencyDefs, itemDefs)}
                    </span>
                    {isFull ? (
                      <span className="od-prod-res-full">Full</span>
                    ) : isDepleting ? (
                      <>
                        <span className="od-prod-res-negative">{formatRate(res.netRatePerHour)}/h</span>
                        <span className="od-prod-res-depletion">⚠ {depletionLabel}</span>
                      </>
                    ) : (
                      <span className="od-prod-res-amount">+{formatRate(res.netRatePerHour)}/h</span>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
        {resourceSummaries.length === 0 && (
          <div className="od-empty-tasks">No active generators.</div>
        )}
        {constructingBuildings.length > 0 && (
          <div className="od-timers-construction">
            <div className="od-timers-section-label">Construction</div>
            {constructingBuildings.map((b: any) => (
              <BuildingProgressBar
                key={b.id}
                name={b.name}
                startTick={b.startTick}
                durationTicks={b.durationTicks}
                tickRate={tickRate}
                isUpgrade={!!b.jobData?.upgradeToLevel}
                onComplete={() => handleCompleteBuilding(b.id)}
              />
            ))}
          </div>
        )}
        {locationJobs.length > 0 && (
          <div className="od-timers-construction">
            <div className="od-timers-section-label">
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
        <div className="od-prod-actions" style={{ position: 'relative' }}>
          <LootPop
            key={lootPopKey.current}
            items={lootPopItems}
            durationMs={1500}
            onComplete={() => setLootPopItems([])}
          />
          <button
            className={`od-collect-btn ${!hasClaimable ? 'disabled' : ''}`}
            onClick={handleClaim}
            disabled={!hasClaimable || claiming}
          >
            {claiming ? 'Collecting...' : 'Collect'}
          </button>
        </div>
      </div>

      <div className="od-card od-card-workers">
        <h3 className="od-card-title">WORKERS ({workersData.length})</h3>
        <div className="od-workers-detail-list">
          {assignedEntities.map((entity: any) => (
            <div key={entity.id} className="od-worker-detail">
              <span className="od-worker-detail-icon">🐦</span>
              <div className="od-worker-detail-info">
                <div className="od-worker-detail-name">{entity.name}</div>
                <div className="od-worker-detail-level">Level {entity.level}</div>
              </div>
              <div className="od-worker-detail-stats">
                <span>ATK {(entity.stats as any)?.ATK || 0}</span>
                <span>DEF {(entity.stats as any)?.DEF || 0}</span>
              </div>
            </div>
          ))}
          {workersData
            .filter((w: any) => !entities.find((b: any) => b.id === w.entityId))
            .map((w: any) => (
              <div key={w.id} className="od-worker-detail">
                <span className="od-worker-detail-icon">🐦</span>
                <div className="od-worker-detail-info">
                  <div className="od-worker-detail-name">Entity</div>
                  <div className="od-worker-detail-level">Slot {w.slotIndex + 1}</div>
                </div>
              </div>
            ))}
          {workersData.length === 0 && (
            <div className="od-empty-tasks">No workers assigned to this outpost.</div>
          )}
        </div>
      </div>

      <div className="od-card od-card-warehouse">
        <h3 className="od-card-title">WAREHOUSE</h3>
        {hasWarehouse ? (
          allWarehouseStorageItems.length > 0 ? (
            <div className="od-storage-list">
              {allWarehouseStorageItems.map((res) => {
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
                return (
                  <div key={res.key} className="od-storage-item">
                    <span className="od-storage-icon">
                      <GameIcon src={resolveIcon(res.outputType, res.outputRefId, currencyDefs, itemDefs)} size={16} />
                    </span>
                    <div className="od-storage-info">
                      <div className="od-storage-name">
                        {resolveName(res.outputType, res.outputRefId, currencyDefs, itemDefs)}
                      </div>
                      <div className="od-storage-bar-wrap">
                        <div
                          className={`od-storage-bar ${isFull ? 'full' : ''} ${isDepleting ? 'depleting' : ''}`}
                          style={{ width: `${Math.min(pct, 100)}%` }}
                        />
                      </div>
                      {isDepleting && (
                        <div className="od-storage-depletion-timer">⚠ {depletionLabel} left</div>
                      )}
                    </div>
                    <span className="od-storage-amount">
                      {formatAmount(res.current)} / {formatAmount(res.capacity)}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="od-empty-tasks">No resources stored yet.</div>
          )
        ) : (
          <div className="od-warehouse-empty">
            <div className="od-warehouse-empty-blurb">
              No warehouse on this outpost. Build one to unlock storage capacity for stockpiling resources.
            </div>
            {(() => {
              const slotsBlocked = availableData?.slotsAvailable === false;
              const ctaDisabled = !warehouseDef || slotsBlocked;
              const ctaLabel = !warehouseDef
                ? 'Warehouse not yet available'
                : slotsBlocked
                  ? 'No building slots available'
                  : '🏗️ Build a Warehouse';
              return (
                <button
                  className="od-warehouse-build-cta"
                  disabled={ctaDisabled}
                  onClick={() => !ctaDisabled && warehouseDef && openBuildModal(warehouseDef)}
                >
                  {ctaLabel}
                </button>
              );
            })()}
          </div>
        )}
      </div>

      {sortedBuildings.map((b: any) => (
        <BuildingCard
          key={b.id}
          outpostId={id}
          building={b}
          resourceSummaries={resourceSummaries}
          currencyDefs={currencyDefs}
          itemDefs={itemDefs}
          tickRate={tickRate}
          onCompleteBuilding={handleCompleteBuilding}
          onUpgradeClick={openUpgradeModal}
        />
      ))}

      <div className="od-card od-card-add-building">
        <h3 className="od-card-title">ADD A BUILDING</h3>
        {loadingAvailable && (
          <div className="od-empty-tasks">Loading available buildings...</div>
        )}
        {!loadingAvailable && (() => {
          const filteredAvailable = (availableData?.available || []).filter(
            (def: any) => def.id !== WAREHOUSE_DEF_ID || !hasWarehouse,
          );
          if (filteredAvailable.length === 0) {
            return <div className="od-empty-tasks">No buildings available to build.</div>;
          }
          const slotBlocked = availableData?.slotsAvailable === false;
          return (
            <div className="facilities-available-list">
              {slotBlocked && (
                <div className="facility-slot-warning">
                  {availableData?.nextSlotRequirement
                    ? `Requires ${availableData.nextSlotRequirement} for more building slots.`
                    : 'No additional building slots available.'}
                </div>
              )}
              {filteredAvailable.map((def: any) => (
                <div key={def.id} className={`available-building-card ${slotBlocked ? 'is-blocked' : ''}`}>
                  <div className="available-card-top">
                    <span className="available-card-name">{def.name}</span>
                    <button
                      className="build-pill"
                      onClick={() => openBuildModal(def)}
                      disabled={slotBlocked}
                      title={slotBlocked ? 'No building slots available' : undefined}
                    >
                      BUILD
                    </button>
                  </div>
                  <div className="available-card-divider" />
                  <div className="available-card-bottom">
                    <span className="available-card-desc">{def.description}</span>
                  </div>
                </div>
              ))}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
