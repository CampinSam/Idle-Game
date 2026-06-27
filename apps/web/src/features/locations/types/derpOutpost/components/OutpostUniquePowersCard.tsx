import { useState, useCallback } from 'react';
import { useNow } from '../../../../../hooks/useNow';
import { useAppSelector } from '../../../../../store';
import { useCommand } from '../../../../../hooks/useCommand';
import { useNotifications } from '../../../../../context/NotificationContext';
import { Card } from '../../../../../components/ui';
import { getUniqueEntry } from '../getUniqueEntry';
import type { PowerRef } from '@derp/shared';
import type { PowerChargeStatus } from '../../../../../store/syncSlice';

import { formatCountdown } from '../../../../../features/powers/powerUtils';
import { formatPowerValue } from '../../../../../utils/globalPowerUtils';

function powerKey(p: PowerRef): string {
  return p.key ?? p.powerType ?? p.effectDefId ?? 'unknown';
}

function powerValueLabel(p: PowerRef): string {
  if (p.value === undefined) return '—';
  return formatPowerValue(p.value, p.valueMode ?? 'percent_add');
}

interface PowerRowProps {
  power: PowerRef;
  charge: PowerChargeStatus | null;
  isBusy: boolean;
  now: number;
  onTrigger: (key: string) => void;
}

function PowerRow({ power, charge, isBusy, now, onTrigger }: PowerRowProps) {
  const costPerUse = charge?.costPerUse ?? 1;
  const maxChargeUnits = charge?.maxChargeUnits ?? costPerUse;
  const chargeUnits = charge?.chargeUnits ?? 0;
  // Also treat as activatable when readyAtMs has already elapsed — the store
  // still holds stale chargeUnits until the next server patch arrives.
  const canActivate = chargeUnits >= costPerUse || (charge?.readyAtMs != null && now >= charge.readyAtMs);

  const usesRemaining = Math.floor(chargeUnits / costPerUse);
  const usesMax = Math.floor(maxChargeUnits / costPerUse);

  const label = power.name || powerKey(power);
  const valueLabel = powerValueLabel(power);

  let countdownSecs: number | null = null;
  if (!canActivate && charge?.readyAtMs != null) {
    countdownSecs = Math.max(0, Math.ceil((charge.readyAtMs - now) / 1000));
  }

  return (
    <div className="flex flex-col gap-1.5 p-3 rounded-xl bg-white/[0.03] border border-[rgba(139,92,246,0.12)]">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-extrabold text-[#fde68a] tracking-[0.3px]">{label}</span>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="text-[11px] font-bold text-[#fde68a]/80">{valueLabel}</span>
          <span className="text-[9px] text-white/30">·</span>
          <span className="text-[11px] text-white/50">{power.durationMinutes}m</span>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          {Array.from({ length: Math.max(1, usesMax) }).map((_, i) => (
            <div
              key={i}
              className={[
                'w-2 h-2 rounded-full border',
                i < usesRemaining
                  ? 'bg-[#F59E0B]/70 border-[#F59E0B]/50'
                  : 'bg-[rgba(139,92,246,0.25)] border-[rgba(139,92,246,0.3)]',
              ].join(' ')}
            />
          ))}
          <span className="text-[10px] text-white/50 ml-1">
            {usesRemaining} / {usesMax} charges
          </span>
        </div>

        {!canActivate ? (
          <span className="text-[9px] font-mono text-white/35 flex-shrink-0">
            {countdownSecs != null
              ? `Ready in ${formatCountdown(countdownSecs)}`
              : 'No charges'}
          </span>
        ) : (
          <button
            type="button"
            disabled={isBusy}
            onClick={() => onTrigger(powerKey(power))}
            className="px-3 py-1 rounded-full text-[11px] font-extrabold tracking-[0.04em] cursor-pointer transition-[filter,transform] hover:brightness-110 active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed border border-[#F59E0B]/50"
            style={{
              background: 'linear-gradient(135deg, rgba(124,58,237,0.6), rgba(245,158,11,0.4))',
              color: '#fde68a',
            }}
          >
            Activate
          </button>
        )}
      </div>
    </div>
  );
}

interface OutpostUniquePowersCardProps {
  outpost: any;
}

export function OutpostUniquePowersCard({ outpost }: OutpostUniquePowersCardProps) {
  const { execute } = useCommand();
  const { addLocalToast } = useNotifications();
  const storedUsages = useAppSelector((s) => s.sync.locationPowerUsages[outpost.id] ?? {});
  const [triggering, setTriggering] = useState<string | null>(null);
  const now = useNow(1000);

  const uniqueEntry = getUniqueEntry(
    { nftAssetId: outpost.nftAssetId },
    outpost.definition || { rules: outpost.rules },
  );

  const powers: PowerRef[] = uniqueEntry?.powers ?? [];

  const handleTrigger = useCallback(
    async (key: string) => {
      if (triggering) return;
      setTriggering(key);
      try {
        await execute('TriggerLocationPower', { locationId: outpost.id, powerKey: key });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to activate power';
        const isCharge = msg.includes('Insufficient charges') || msg.includes('charge');
        addLocalToast({
          title: isCharge ? 'Insufficient Charges' : 'Power Failed',
          body: msg,
          icon: '❌',
          accentColor: '#EF4444',
          durationMs: 8000,
        });
      } finally {
        setTriggering(null);
      }
    },
    [outpost.id, execute, addLocalToast, triggering],
  );

  if (powers.length === 0) return null;

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-black tracking-[0.8px] text-[#fde68a]/70 uppercase">Unique NFT Powers</span>
        <div className="flex-1 h-px bg-[rgba(245,158,11,0.15)]" />
      </div>
      {powers.map((p) => {
        const k = powerKey(p);
        const charge = storedUsages[k] ?? null;
        return (
          <PowerRow
            key={k}
            power={p}
            charge={charge}
            isBusy={!!triggering}
            now={now}
            onTrigger={handleTrigger}
          />
        );
      })}
    </Card>
  );
}
