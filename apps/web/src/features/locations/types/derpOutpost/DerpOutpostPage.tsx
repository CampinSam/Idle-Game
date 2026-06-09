import { useEffect, useState, useRef, useMemo } from 'react';
import { useAppDispatch, useAppSelector } from '../../../../store';
import { fetchCurrencyDefs, fetchItemDefs } from '../../../../store/gameSlice';
import { useSyncEntities, useAllActiveJobs } from '../../../../hooks/useSyncSelectors';
import { useCommand } from '../../../../hooks/useCommand';
import { useLocationTimers } from '../../../../hooks/useLocationTimers';
import { useModal } from '../../../../context/ModalContext';
import { useNotifications } from '../../../../context/NotificationContext';
import { api } from '../../../../services/api';
import BuildingCard from './components/BuildingCard';
import { OutpostHeader } from './components/OutpostHeader';
import { OutpostHeroSection } from './components/OutpostHeroSection';
import { OutpostProductionCard } from './components/OutpostProductionCard';
import { OutpostWorkersCard } from './components/OutpostWorkersCard';
import { OutpostWarehouseCard } from './components/OutpostWarehouseCard';
import { AddBuildingCard } from './components/AddBuildingCard';
import { OutpostDetailsCard } from './components/OutpostDetailsCard';
import { OutpostUniquePowersCard } from './components/OutpostUniquePowersCard';
import type { LocationPageProps } from '../../registry';

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
  const { notifications, markRead } = useNotifications();
  const entities = useSyncEntities();
  const autoOpenedLevelUpRef = useRef<Set<string>>(new Set());
  const currencyDefs = useAppSelector((s) => s.game.currencyDefs);
  const itemDefs = useAppSelector((s) => s.game.itemDefs);
  const locationTimerMap = useLocationTimers();
  const allActiveJobs = useAllActiveJobs();

  const [availableData, setAvailableData] = useState<any>(null);
  const [loadingAvailable, setLoadingAvailable] = useState(false);

  const id = outpost.id;

  useEffect(() => {
    if (currencyDefs.length === 0) dispatch(fetchCurrencyDefs());
    if (itemDefs.length === 0) dispatch(fetchItemDefs());
  }, [dispatch, currencyDefs.length, itemDefs.length]);

  useEffect(() => {
    const match = notifications.find(
      (n) =>
        n.type === 'location_level_up' &&
        !n.readAt &&
        n.meta?.locationId === id &&
        !autoOpenedLevelUpRef.current.has(n.id),
    );
    if (!match) return;
    autoOpenedLevelUpRef.current.add(match.id);
    (async () => {
      try {
        const spec = await api.getModalSpec({ locationId: id, levelUp: true, notificationId: match.id });
        if (spec?.version === 1) pushModal(spec);
        markRead([match.id]).catch(() => {});
      } catch (err) {
        console.error('[DerpOutpostPage] Failed to auto-open level-up modal:', err);
      }
    })();
  }, [notifications, id, pushModal, markRead]);

  useEffect(() => {
    let cancelled = false;
    setLoadingAvailable(true);
    api.getAvailableBuildings(id)
      .then((data) => { if (!cancelled) setAvailableData(data); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoadingAvailable(false); });
    return () => { cancelled = true; };
  }, [id, outpost.level]);

  const timerData = locationTimerMap.get(id);
  const resourceSummaries = timerData?.resourceSummaries || [];

  const hasActivity = resourceSummaries.some(
    (r) => r.totalRatePerHour !== 0 || r.netRatePerHour < 0,
  );

  const buildingsData: any[] = outpost.buildings || [];
  const workersData: any[] = outpost.workers || [];

  const isWarehouse = (b: any) =>
    (b.buildingDefId || b.defId || b.definitionId) === WAREHOUSE_DEF_ID;
  const warehouseBuildings = buildingsData.filter(isWarehouse);
  const hasWarehouse = warehouseBuildings.length > 0;

  const sortedBuildings = useMemo(
    () =>
      [...buildingsData].sort((a: any, b: any) => {
        const oa = CATEGORY_ORDER[a.category] ?? 99;
        const ob = CATEGORY_ORDER[b.category] ?? 99;
        if (oa !== ob) return oa - ob;
        return (a.name || '').localeCompare(b.name || '');
      }),
    [buildingsData],
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

  const handleCompleteBuilding = async (buildingId: string) => {
    try {
      await execute('CompleteBuilding', { locationId: id, buildingId });
    } catch (err: any) {
      console.error('Failed to complete building:', err);
    }
  };

  const warehouseDef = useMemo(
    () => (availableData?.available || []).find((def: any) => def.id === WAREHOUSE_DEF_ID),
    [availableData],
  );

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <OutpostHeader outpost={outpost} />

      <div className="flex flex-col flex-1 min-h-0 overflow-x-hidden overflow-y-auto touch-pan-y [-webkit-overflow-scrolling:touch] overscroll-contain">
        <div className="flex flex-col gap-3.5 px-3 pt-3 pb-6">
          <OutpostHeroSection outpost={outpost} />

          <OutpostUniquePowersCard outpost={outpost} />

          <OutpostDetailsCard outpost={outpost} />

        <div className="grid grid-cols-2 gap-3.5 items-stretch">
        <OutpostProductionCard
          outpost={outpost}
          resourceSummaries={resourceSummaries}
          hasActivity={hasActivity}
          constructingBuildings={constructingBuildings}
          locationJobs={locationJobs}
          onCompleteBuilding={handleCompleteBuilding}
        />

        <OutpostWarehouseCard
          outpost={outpost}
          hasWarehouse={hasWarehouse}
          storageItems={allWarehouseStorageItems}
          resourceSummaries={resourceSummaries}
          warehouseDef={warehouseDef}
          warehouseBuilding={warehouseBuildings[0] ?? null}
          slotsBlocked={availableData?.slotsAvailable === false}
        />
      </div>

      <OutpostWorkersCard
        outpost={outpost}
        entities={entities}
        workersData={workersData}
      />

      {sortedBuildings.map((b: any) => (
        <BuildingCard
          key={b.id}
          outpostId={id}
          building={b}
          resourceSummaries={resourceSummaries}
          currencyDefs={currencyDefs}
          itemDefs={itemDefs}
          onCompleteBuilding={handleCompleteBuilding}
        />
      ))}

      <AddBuildingCard
        loading={loadingAvailable}
        availableData={availableData}
        hasWarehouse={hasWarehouse}
        warehouseDefId={WAREHOUSE_DEF_ID}
        locationId={id}
        buildings={buildingsData}
      />
        </div>
      </div>
    </div>
  );
}
