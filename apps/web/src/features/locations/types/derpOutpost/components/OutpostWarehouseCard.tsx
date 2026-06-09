import { useRef, useState } from 'react';
import { useAppSelector } from '../../../../../store';
import { useCommand } from '../../../../../hooks/useCommand';
import { useJobPreview } from '../../../../jobs/useJobPreview';
import { audioEngine } from '../../../../../services/AudioEngine';
import { resolveIcon, resolveName } from '../../../../../utils/iconResolver';
import { formatDuration } from '../../../../../utils/formatDuration';
import GameIcon from '../../../../../components/GameIcon';
import ItemQty from '../../../../../components/ItemQty';
import LootPop, { type LootPopItem } from '../../../../../components/LootPop';
import { Divider, OutpostCard } from '../../../../../components/ui';
import { formatAmount } from '../../../../../utils/locationProduction';
import { useProgressAnimation } from '../../../../../hooks/useProgressAnimation';

function WarehouseStorageBar({
  current,
  capacity,
  netRatePerHour,
  resetKey,
  barClass,
}: {
  current: number;
  capacity: number;
  netRatePerHour: number;
  resetKey: string | number;
  barClass: string;
}) {
  const pct = capacity > 0 ? Math.min((current / capacity) * 100, 100) : 0;
  const remainingMs =
    netRatePerHour > 0
      ? ((capacity - current) / netRatePerHour) * 3600 * 1000
      : Infinity;
  const fillStyle = useProgressAnimation(pct, remainingMs, resetKey);

  return (
    <div className="h-1 rounded-full bg-black/45 overflow-hidden">
      <div className={`h-full rounded-full ${barClass}`} style={fillStyle} />
    </div>
  );
}

interface StorageItem {
  key: string;
  outputType: string;
  outputRefId: string;
  current: number;
  capacity: number;
}

interface OutpostWarehouseCardProps {
  outpost: any;
  hasWarehouse: boolean;
  storageItems: StorageItem[];
  resourceSummaries: any[];
  warehouseDef: any;
  warehouseBuilding: any | null;
  slotsBlocked: boolean;
}

export function OutpostWarehouseCard({
  outpost,
  hasWarehouse,
  storageItems,
  resourceSummaries,
  warehouseDef,
  warehouseBuilding,
  slotsBlocked,
}: OutpostWarehouseCardProps) {
  const { execute } = useCommand();
  const currencyDefs = useAppSelector((s) => s.game.currencyDefs);
  const itemDefs = useAppSelector((s) => s.game.itemDefs);

  const [claiming, setClaiming] = useState(false);
  const [lootPopItems, setLootPopItems] = useState<LootPopItem[]>([]);
  const lootPopKey = useRef(0);
  const claimEpoch = useRef(0);
  const [showPreview, setShowPreview] = useState(false);
  const [cmdError, setCmdError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const warehouseDefId: string = warehouseDef?.id ?? warehouseBuilding?.buildingDefId ?? '';
  const { preview, loading: previewLoading } = useJobPreview({
    jobType: 'building',
    defId: warehouseDefId,
    locationId: outpost.id,
    debounceMs: 0,
  });

  const hasClaimable =
    storageItems.some((item) => Math.floor(item.current) >= 1) ||
    resourceSummaries.some((res) => Math.floor(res.currentAmount) >= 1);

  const handleClaim = async () => {
    if (!outpost.id || claiming) return;
    setClaiming(true);
    setLootPopItems([]);

    const snapshot = resourceSummaries
      .map((res): LootPopItem | null => {
        const floored = Math.floor(res.currentAmount);
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
      claimEpoch.current += 1;
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

  const isMaxLevel =
    warehouseBuilding != null &&
    warehouseBuilding.level >= (warehouseBuilding.maxLevel ?? 999);

  const showMaxPill = !isMaxLevel;

  const pillDisabled = hasWarehouse
    ? !warehouseBuilding
    : !warehouseDef || slotsBlocked;

  const handleMaxPill = () => {
    if (pillDisabled) return;
    setCmdError(null);
    setShowPreview((v) => !v);
  };

  const handleBuildWarehouse = async () => {
    if (!warehouseDefId) return;
    setCmdError(null);
    setBusy(true);
    try {
      await execute('BuildBuilding', { locationId: outpost.id, buildingDefId: warehouseDefId });
      setShowPreview(false);
    } catch (err: any) {
      setCmdError(err?.message ?? 'Build failed');
    } finally {
      setBusy(false);
    }
  };

  const handleUpgradeWarehouse = async () => {
    if (!warehouseBuilding?.id) return;
    setCmdError(null);
    setBusy(true);
    try {
      await execute('UpgradeBuilding', { locationId: outpost.id, buildingId: warehouseBuilding.id });
      setShowPreview(false);
    } catch (err: any) {
      setCmdError(err?.message ?? 'Upgrade failed');
    } finally {
      setBusy(false);
    }
  };

  const upgrade = preview?.building?.upgrade ?? null;
  const isUpgradeMode = hasWarehouse && !!warehouseBuilding;
  const costToShow = isUpgradeMode ? (upgrade?.cost ?? []) : (preview?.cost ?? []);
  const canAffordToShow = isUpgradeMode ? (upgrade?.canAfford ?? false) : (preview?.canAfford ?? false);
  const durationToShow = isUpgradeMode ? (upgrade?.durationSeconds ?? 0) : (preview?.durationSeconds ?? 0);
  const canAct = isUpgradeMode
    ? (upgrade?.canAfford ?? false) && (preview?.allRequirementsMet ?? false)
    : (preview?.canAfford ?? false) && (preview?.allRequirementsMet ?? false) && !slotsBlocked;

  return (
    <OutpostCard accent="warehouse" className="flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <h3
          className="font-cinzel text-[11px] font-extrabold tracking-[1.4px] uppercase m-0 [text-shadow:0_0_12px_rgba(139,92,246,0.25)]"
          style={{ color: '#fcd34d' }}
        >
          STORAGE
        </h3>
        {showMaxPill && (
          <button
            onClick={handleMaxPill}
            disabled={pillDisabled}
            className="text-[10px] font-extrabold tracking-wide text-[#1f1206] px-2 py-0.5 rounded-full border border-[rgba(252,211,77,0.5)] transition-[filter] hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}
          >
            {showPreview ? '✕ Close' : '+ Max'}
          </button>
        )}
      </div>

      {showPreview && warehouseDefId && (
        <div className="mb-3 flex flex-col gap-2 rounded-xl border border-[rgba(252,211,77,0.25)] bg-[rgba(245,158,11,0.06)] p-3">
          <span className="text-[10px] font-extrabold tracking-[0.08em] uppercase text-[#fcd34d]">
            {isUpgradeMode ? `Upgrade Warehouse → Lv ${(upgrade?.toLevel ?? 0)}` : 'Build Warehouse'}
          </span>

          {previewLoading && (
            <div className="flex flex-col gap-1.5 animate-pulse">
              <div className="h-3 rounded bg-white/10 w-2/3" />
              <div className="h-3 rounded bg-white/10 w-1/2" />
            </div>
          )}

          {!previewLoading && preview && (
            <>
              {preview.requirements.length > 0 && (
                <div className="flex flex-col gap-1">
                  {preview.requirements.map((req, i) => (
                    <div key={i} className="flex items-center gap-1.5 text-[11px]">
                      <span className={req.met ? 'text-[#34d399]' : 'text-[#f87171]'}>
                        {req.met ? '✓' : '✗'}
                      </span>
                      <span className={req.met ? 'text-text-secondary' : 'text-[#f87171]'}>
                        {req.label ?? (req.met ? 'Requirement met' : 'Requirement not met')}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {costToShow.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {costToShow.map((c: any, i: number) => (
                    <span
                      key={i}
                      className={`inline-flex items-center gap-1 text-[12px] font-bold ${
                        canAffordToShow ? 'text-[#34d399]' : 'text-[#f87171]'
                      }`}
                    >
                      <ItemQty src={c.id} amount={c.amount} size={14} className="text-[12px] font-bold" />
                      <span className={canAffordToShow ? 'text-[#34d399]' : 'text-[#f87171]'}>
                        {canAffordToShow ? '✓' : '✗'}
                      </span>
                    </span>
                  ))}
                </div>
              )}

              {durationToShow > 0 && (
                <div className="flex items-center gap-2 text-[12px]">
                  <span className="text-text-secondary">⏱ Time</span>
                  <span className="font-bold text-[#f5f3ff]">{formatDuration(durationToShow)}</span>
                </div>
              )}

              {cmdError && (
                <div className="text-[11px] text-[#f87171] bg-[rgba(239,68,68,0.08)] border border-[rgba(239,68,68,0.2)] rounded-lg px-3 py-1.5">
                  {cmdError}
                </div>
              )}

              <button
                onClick={isUpgradeMode ? handleUpgradeWarehouse : handleBuildWarehouse}
                disabled={!canAct || busy}
                className="self-start px-4 py-1.5 rounded-full text-[11px] font-extrabold tracking-[0.08em] uppercase cursor-pointer hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 disabled:grayscale"
                style={{
                  background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                  color: '#1f1206',
                  border: '1px solid rgba(252,211,77,0.5)',
                }}
              >
                {busy ? 'Working…' : isUpgradeMode ? 'CONFIRM UPGRADE' : 'BUILD'}
              </button>
            </>
          )}
        </div>
      )}

      {storageItems.length > 0 && (
        <div className="flex flex-col flex-1">
          {storageItems.map((res, idx) => {
            const pct = res.capacity > 0 ? Math.min((res.current / res.capacity) * 100, 100) : 0;
            const isFull = pct >= 99.5;
            const isNearFull = pct >= 90;

            const barClass = isFull
              ? 'bg-gradient-to-r from-[#ef4444] to-[#dc2626]'
              : isNearFull
                ? 'bg-gradient-to-r from-[#f59e0b] to-[#d97706]'
                : 'bg-gradient-to-r from-[#fbbf24] to-[#f59e0b]';

            const icon = resolveIcon(res.outputType, res.outputRefId, currencyDefs, itemDefs);
            const name = resolveName(res.outputType, res.outputRefId, currencyDefs, itemDefs);

            const indicator = isFull ? '🔴' : isNearFull ? '⚠️' : null;

            const matchingSummary = resourceSummaries.find(
              (s) => s.outputType === res.outputType && s.outputRefId === res.outputRefId,
            );
            const netRatePerHour: number = matchingSummary?.netRatePerHour ?? 0;
            const resetKey: string = `${(outpost as any)?.storage?.lastSettledAt ?? res.key}:${claimEpoch.current}`;

            return (
              <div key={res.key}>
                {idx > 0 && <Divider className="my-2" />}
                <div className="flex items-center gap-2 px-0.5 py-1">
                  <span className="flex-shrink-0">
                    <GameIcon src={icon} size={14} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1 mb-1.5">
                      {indicator && (
                        <span className="text-[11px] leading-none">{indicator}</span>
                      )}
                      <span className="text-[11px] font-semibold text-[#f1f5f9] truncate">
                        {name}
                      </span>
                    </div>
                    <WarehouseStorageBar
                      current={res.current}
                      capacity={res.capacity}
                      netRatePerHour={netRatePerHour}
                      resetKey={resetKey}
                      barClass={barClass}
                    />
                  </div>
                  <span className="text-[10px] font-bold text-[#fcd34d] whitespace-nowrap ml-1">
                    {formatAmount(res.current)}/{formatAmount(res.capacity)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="relative mt-auto pt-3">
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
