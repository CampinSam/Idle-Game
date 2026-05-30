import { useRef, useState } from 'react';
import { useAppSelector } from '../../../../../store';
import { useCommand } from '../../../../../hooks/useCommand';
import { audioEngine } from '../../../../../services/AudioEngine';
import { resolveIcon, resolveName } from '../../../../../utils/iconResolver';
import GameIcon from '../../../../../components/GameIcon';
import LootPop, { type LootPopItem } from '../../../../../components/LootPop';
import { Divider, OutpostCard } from '../../../../../components/ui';
import { formatAmount } from '../../../../../utils/locationProduction';

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
  onBuild: (def: any) => void;
  onUpgrade: (building: any) => void;
}

export function OutpostWarehouseCard({
  outpost,
  hasWarehouse,
  storageItems,
  resourceSummaries,
  warehouseDef,
  warehouseBuilding,
  slotsBlocked,
  onBuild,
  onUpgrade,
}: OutpostWarehouseCardProps) {
  const { execute } = useCommand();
  const currencyDefs = useAppSelector((s) => s.game.currencyDefs);
  const itemDefs = useAppSelector((s) => s.game.itemDefs);

  const [claiming, setClaiming] = useState(false);
  const [lootPopItems, setLootPopItems] = useState<LootPopItem[]>([]);
  const lootPopKey = useRef(0);

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

  const handleMaxPill = () => {
    if (hasWarehouse && warehouseBuilding) {
      onUpgrade(warehouseBuilding);
    } else if (warehouseDef) {
      onBuild(warehouseDef);
    }
  };

  const pillDisabled = hasWarehouse
    ? !warehouseBuilding
    : !warehouseDef || slotsBlocked;

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
            + Max
          </button>
        )}
      </div>

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
                    <div className="h-1 rounded-full bg-black/45 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-[width] duration-[400ms] ${barClass}`}
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
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
