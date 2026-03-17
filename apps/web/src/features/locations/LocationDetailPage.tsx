import { useEffect, useState, useRef, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../store';
import { fetchCurrencyDefs, fetchItemDefs } from '../../store/gameSlice';
import {
  useSyncEntities,
  useSyncLocations,
} from '../../hooks/useSyncSelectors';
import { useCommand } from '../../hooks/useCommand';
import { resolveIcon, resolveName } from '../../utils/iconResolver';
import GameIcon from '../../components/GameIcon';
import { useTickRate } from '../../tick';
import { useLocationTimers } from '../../hooks/useLocationTimers';
import {
  formatRate,
  formatAmount,
  formatTimeRemaining,
  computeInventoryAmount,
} from '../../utils/locationProduction';
import LootPop, { type LootPopItem } from '../../components/LootPop';
import FacilitiesTab from './FacilitiesTab';
import { useModal } from '../../context/ModalContext';
import { api } from '../../services/api';
import { getRegionDisplay } from '@derp/shared';
import './LocationDetailPage.css';

const SIZE_LABELS: Record<number, string> = {
  1: 'SMALL',
  2: 'SMALL',
  3: 'MEDIUM',
  4: 'MEDIUM',
  5: 'LARGE',
};

const TABS = ['OVERVIEW', 'FACILITIES', 'WORKERS', 'STORAGE'];

function getFortification(level: number): { current: number; max: number } {
  return { current: Math.min(level + 1, 6), max: 6 };
}

function getDefenseBoost(level: number): number {
  return Math.min(6 + level * 3, 40);
}

export default function LocationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const dispatch = useAppDispatch();
  const { execute } = useCommand();
  const { pushModal } = useModal();
  const entities = useSyncEntities();
  const locations = useSyncLocations();
  const currencyDefs = useAppSelector((s) => s.game.currencyDefs);
  const itemDefs = useAppSelector((s) => s.game.itemDefs);
  const syncItems = useAppSelector((s) => s.sync.items);
  const currencyBalances = useAppSelector((s) => s.sync.currencyBalances);
  const [activeTab, setActiveTabRaw] = useState(0);
  const [claiming, setClaiming] = useState(false);
  const [lootPopItems, setLootPopItems] = useState<LootPopItem[]>([]);
  const lootPopKey = useRef(0);
  const setActiveTab = (tab: number) => { setLootPopItems([]); setActiveTabRaw(tab); };
  const tickRate = useTickRate();
  const locationTimerMap = useLocationTimers();

  const outpost = locations.find((op: any) => op.id === id);

  useEffect(() => {
    if (currencyDefs.length === 0) dispatch(fetchCurrencyDefs());
    if (itemDefs.length === 0) dispatch(fetchItemDefs());
  }, [dispatch, currencyDefs.length, itemDefs.length]);

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
      await execute('ClaimLocation', { locationId: id });
      if (snapshot.length > 0) {
        lootPopKey.current += 1;
        setLootPopItems(snapshot);
      }
    } catch (err: any) {
      alert('Claim failed: ' + (err.message || 'Unknown error'));
    } finally {
      setClaiming(false);
    }
  };

  const handleCompleteBuilding = async (buildingId: string) => {
    if (!id) return;
    try {
      await execute('CompleteBuilding', { locationId: id, buildingId });
    } catch (err: any) {
      console.error('Failed to complete building:', err);
    }
  };

  const openBuildModal = async (def: any) => {
    if (!id) return;
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
    if (!id) return;
    try {
      const buildingDefId = building.buildingDefId || building.defId || building.definitionId;
      const spec = await api.getModalSpec({ buildingDefId, locationId: id, buildingId: building.id });
      if (spec?.version === 1) pushModal(spec);
    } catch (err: any) {
      console.error('[LocationDetailPage] Failed to load upgrade modal:', err);
    }
  };

  if (!outpost) {
    return (
      <div className="outpost-detail-page">
        <div className="od-loading">Loading outpost...</div>
      </div>
    );
  }

  const regionDisplay = getRegionDisplay(outpost.region);
  const regionName = regionDisplay.displayName;
  const regionImage = regionDisplay.imagePath;
  const size = SIZE_LABELS[outpost.level] || (outpost.level >= 5 ? 'LARGE' : 'SMALL');
  const fort = getFortification(outpost.level);
  const defenseBoost = getDefenseBoost(outpost.level);

  const outpostIndex = locations.findIndex((op: any) => op.id === outpost.id);
  const idLabel = `#${String(outpostIndex >= 0 ? outpostIndex + 1 : 1).padStart(5, '0')}`;

  const timerData = locationTimerMap.get(outpost.id);
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
  const storageBalances = Object.entries((outpost.storage?.stored as Record<string, number>) || {}).map(([key, amount]) => ({
    outputRefId: key,
    amount: Number(amount),
    outputType: 'ITEM' as const,
  }));

  const storedResources = Object.values((outpost.storage?.stored as Record<string, number>) || {});
  const hasClaimable =
    resourceSummaries.some((res) => Math.floor(res.currentAmount) >= 1) ||
    storedResources.some((v) => Math.floor(Number(v)) >= 1);

  const assignedEntityIds = workersData.map((w: any) => w.entityId);
  const assignedEntities = entities.filter((b: any) => assignedEntityIds.includes(b.id));

  const fortPercent = (fort.current / fort.max) * 100;
  const circumference = 2 * Math.PI * 38;
  const strokeDashoffset = circumference - (fortPercent / 100) * circumference;

  const allStorageItems = useMemo(() => {
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

  const hasStorageData = allStorageItems.length > 0;

  return (
    <div className="outpost-detail-page">
      <div className="od-container">
        <div className="od-header">
          <div className="od-header-info">
            <h1 className="od-name">
              Outpost {idLabel}
              <span className="od-name-region"> &bull; {regionName}</span>
            </h1>
            <div className="od-badges">
              <span className="od-level-badge">Level {outpost.level}</span>
              <span className="od-size-badge">{size}</span>
            </div>
          </div>
          <button className="od-settings-btn">⚙️</button>
        </div>

        <div className="od-hero-image">
          <img src={regionImage} alt={regionName} />
        </div>

        <div className="od-tabs">
          {TABS.map((tab, i) => (
            <button
              key={tab}
              className={`od-tab ${i === activeTab ? 'active' : ''}`}
              onClick={() => setActiveTab(i)}
            >
              {tab}
            </button>
          ))}
        </div>

        {activeTab === 0 && (
          <div className="od-overview">
            <div className="od-cards-row">
              <div className="od-card od-fortification">
                <h3 className="od-card-title">FORTIFICATION</h3>
                <div className="od-fort-content">
                  <div className="od-fort-ring">
                    <svg viewBox="0 0 88 88" className="od-ring-svg">
                      <circle cx="44" cy="44" r="38" fill="none" stroke="#2a2060" strokeWidth="6" />
                      <circle
                        cx="44" cy="44" r="38" fill="none"
                        stroke="#10B981" strokeWidth="6"
                        strokeLinecap="round"
                        strokeDasharray={circumference}
                        strokeDashoffset={strokeDashoffset}
                        transform="rotate(-90 44 44)"
                      />
                    </svg>
                    <div className="od-fort-value">{fort.current}/{fort.max}</div>
                  </div>
                  <div className="od-fort-details">
                    <div className="od-fort-boost">
                      <span className="od-boost-icon">🛡️</span>
                      <span>+{defenseBoost}% Defense Boost</span>
                    </div>
                    {outpost.threatLevel > 0 && (
                      <div className="od-threat-info">
                        <span>⚠️ Threat: {outpost.threatLevel}%</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="od-card od-production">
                <h3 className="od-card-title">PRODUCTION</h3>
                {resourceSummaries.length > 0 ? (
                  <>
                    {hasActivity ? (
                      <div className="od-prod-rate">
                        <span className={`od-prod-value ${effectiveRatePerHour < 0 ? 'negative' : ''}`}>{effectiveRatePerHour >= 0 ? '+' : ''}{formatRate(effectiveRatePerHour)}/h</span>
                      </div>
                    ) : (
                      <div className="od-empty-tasks">No active generators.</div>
                    )}
                    <div className="od-prod-resources">
                      {resourceSummaries.map((res) => {
                        const isFull = res.capacity > 0 && res.currentAmount / res.capacity >= 0.995;
                        const isDepleting = res.netRatePerHour < 0;
                        return (
                          <div key={res.key} className={`od-prod-res ${isDepleting ? 'depleting' : ''}`}>
                            <span className="od-prod-res-icon"><GameIcon src={resolveIcon(res.outputType, res.outputRefId, currencyDefs, itemDefs)} size={16} /></span>
                            <span className="od-prod-res-name">{resolveName(res.outputType, res.outputRefId, currencyDefs, itemDefs)}</span>
                            {isFull ? (
                              <span className="od-prod-res-full">Full</span>
                            ) : isDepleting ? (
                              <span className="od-prod-res-negative">{formatRate(res.netRatePerHour)}/h</span>
                            ) : (
                              <span className="od-prod-res-amount">+{formatRate(res.netRatePerHour)}/h</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <div className="od-empty-tasks">No active generators.</div>
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
            </div>

            <div className="od-cards-row">
              <div className="od-card od-storage-overview">
                <h3 className="od-card-title">STORAGE</h3>
                {hasStorageData ? (
                  <div className="od-storage-mini-list">
                    {resourceSummaries.length > 0 ? (
                      resourceSummaries.map((res) => {
                        const current = res.currentAmount;
                        const pct = res.capacity > 0 ? Math.min((current / res.capacity) * 100, 100) : 0;
                        const isFull = pct >= 99.5;
                        const isDepleting = res.netRatePerHour < 0;
                        let depletionLabel = '';
                        if (isDepleting) {
                          const invAmount = computeInventoryAmount(res.outputType, res.outputRefId, syncItems, currencyBalances);
                          const totalAvailable = current + invAmount;
                          const hoursLeft = totalAvailable / Math.abs(res.netRatePerHour);
                          depletionLabel = formatTimeRemaining(hoursLeft);
                        }

                        return (
                          <div key={res.key} className="od-storage-mini-item">
                            <span className="od-storage-mini-icon"><GameIcon src={resolveIcon(res.outputType, res.outputRefId, currencyDefs, itemDefs)} size={16} /></span>
                            <div className="od-storage-mini-info">
                              <div className="od-storage-mini-name">{resolveName(res.outputType, res.outputRefId, currencyDefs, itemDefs)}</div>
                              <div className="od-storage-bar-wrap">
                                <div className={`od-storage-bar ${isFull ? 'full' : ''} ${isDepleting ? 'depleting' : ''}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                              </div>
                              {isDepleting && (
                                <div className="od-storage-depletion-timer">⚠ {depletionLabel} left</div>
                              )}
                            </div>
                            <span className="od-storage-mini-amount">{formatAmount(current)}/{formatAmount(res.capacity)}</span>
                          </div>
                        );
                      })
                    ) : (
                      storageBalances.filter(s => s.amount >= 1).map((s) => {
                        const resId = s.outputRefId;
                        const outputType = s.outputType;
                        const current = s.amount;
                        const capacity = (outpost.storage?.capacity as any)?.[resId] || 0;
                        const pct = capacity > 0 ? Math.min((current / capacity) * 100, 100) : 0;
                        const isFull = pct >= 99.5;

                        return (
                          <div key={resId} className="od-storage-mini-item">
                            <span className="od-storage-mini-icon"><GameIcon src={resolveIcon(outputType, resId, currencyDefs, itemDefs)} size={16} /></span>
                            <div className="od-storage-mini-info">
                              <div className="od-storage-mini-name">{resolveName(outputType, resId, currencyDefs, itemDefs)}</div>
                              <div className="od-storage-bar-wrap">
                                <div className={`od-storage-bar ${isFull ? 'full' : ''}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                              </div>
                            </div>
                            <span className="od-storage-mini-amount">{formatAmount(current)}/{formatAmount(capacity)}</span>
                          </div>
                        );
                      })
                    )}
                  </div>
                ) : (
                  <div className="od-empty-tasks">No resources stored</div>
                )}
              </div>

              <div className="od-card od-workers">
                <h3 className="od-card-title">WORKERS ({workersData.length})</h3>
                <div className="od-workers-grid">
                  {assignedEntities.map((entity: any) => (
                    <div key={entity.id} className="od-worker">
                      <div className="od-worker-avatar">🐦</div>
                      <div className="od-worker-name">{entity.name}</div>
                      <div className="od-worker-level">Lv {entity.level}</div>
                    </div>
                  ))}
                  {workersData.filter((w: any) => !entities.find((b: any) => b.id === w.entityId)).map((w: any) => (
                    <div key={w.id} className="od-worker">
                      <div className="od-worker-avatar">🐦</div>
                      <div className="od-worker-name">Entity</div>
                      <div className="od-worker-level">Slot {w.slotIndex + 1}</div>
                    </div>
                  ))}
                  {workersData.length === 0 && (
                    <div className="od-empty-tasks">No workers assigned</div>
                  )}
                </div>
              </div>
            </div>

          </div>
        )}

        {activeTab === 1 && (
          <FacilitiesTab
            outpostId={outpost.id}
            buildings={buildingsData}
            resourceSummaries={resourceSummaries}
            storageBalances={storageBalances}
            storageCapacity={outpost.storage?.capacity || {}}
            currencyDefs={currencyDefs}
            itemDefs={itemDefs}
            tickRate={tickRate}
            onBuildClick={(def: any) => openBuildModal(def)}
            onCompleteBuilding={handleCompleteBuilding}
            onUpgradeClick={(b: any) => openUpgradeModal(b)}
          />
        )}

        {activeTab === 2 && (
          <div className="od-tab-content">
            <div className="od-card">
              <h3 className="od-card-title">ASSIGNED WORKERS ({workersData.length})</h3>
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
                {workersData.length === 0 && (
                  <div className="od-empty-tasks">No workers assigned to this outpost.</div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 3 && (
          <div className="od-tab-content">
            <div className="od-card">
              <h3 className="od-card-title">STORAGE</h3>
              {hasStorageData ? (
                <div className="od-storage-list">
                  {allStorageItems.map((res) => {
                    const pct = res.capacity > 0 ? Math.min((res.current / res.capacity) * 100, 100) : 0;
                    const isFull = pct >= 99.5;
                    const resSummary = resourceSummaries.find((s) => s.outputRefId === res.outputRefId && s.outputType === res.outputType);
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
                        <span className="od-storage-icon"><GameIcon src={resolveIcon(res.outputType, res.outputRefId, currencyDefs, itemDefs)} size={16} /></span>
                        <div className="od-storage-info">
                          <div className="od-storage-name">{resolveName(res.outputType, res.outputRefId, currencyDefs, itemDefs)}</div>
                          <div className="od-storage-bar-wrap">
                            <div className={`od-storage-bar ${isFull ? 'full' : ''} ${isDepleting ? 'depleting' : ''}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                          </div>
                          {isDepleting && (
                            <div className="od-storage-depletion-timer">⚠ {depletionLabel} left</div>
                          )}
                        </div>
                        <span className="od-storage-amount">{formatAmount(res.current)} / {formatAmount(res.capacity)}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="od-empty-tasks">No storage configured. Build generators or storage facilities to get started.</div>
              )}
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
