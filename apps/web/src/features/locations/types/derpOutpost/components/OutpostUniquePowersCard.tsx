import { useState, useCallback, useMemo } from 'react';
import { useNow } from '../../../../../hooks/useNow';
import { useAppSelector } from '../../../../../store';
import { useCommand } from '../../../../../hooks/useCommand';
import { useNotifications } from '../../../../../context/NotificationContext';
import { Card } from '../../../../../components/ui';
import { getUniqueEntry } from '../getUniqueEntry';
import type { PowerRef } from '@derp/shared';
import type { UiIntent } from '../../../../../services/api';
import { getUtcDay, getSecondsUntilUtcMidnight, formatCountdown } from '../../../../../features/powers/powerUtils';

/** Stable key for a PowerRef — prefers p.key, then p.powerType, then p.effectDefId (full legacy compat). */
function powerKey(p: PowerRef): string {
  return p.key ?? p.powerType ?? p.effectDefId ?? 'unknown';
}

function powerValueLabel(p: PowerRef): string {
  const isPercent = p.powerType === 'tick_boost' || p.powerType === 'tick_speed_boost'
    || p.powerDefId === 'global_tick_boost';
  if (p.value === undefined) return '—';
  return isPercent ? `+${p.value}%` : `+${p.value}`;
}

interface PowerRowProps {
  power: PowerRef;
  usageCount: number;
  isAtLimit: boolean;
  isBusy: boolean;
  countdown: number;
  onTrigger: (key: string) => void;
}

function PowerRow({ power, usageCount, isAtLimit, isBusy, countdown, onTrigger }: PowerRowProps) {
  const limit = typeof power.dailyLimit === 'number' && power.dailyLimit > 0 ? power.dailyLimit : 1;
  const remaining = Math.max(0, limit - usageCount);
  const label = power.name || powerKey(power);
  const valueLabel = powerValueLabel(power);

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
          {Array.from({ length: limit }).map((_, i) => (
            <div
              key={i}
              className={[
                'w-2 h-2 rounded-full border',
                i < usageCount
                  ? 'bg-[rgba(139,92,246,0.25)] border-[rgba(139,92,246,0.3)]'
                  : 'bg-[#F59E0B]/70 border-[#F59E0B]/50',
              ].join(' ')}
            />
          ))}
          <span className="text-[10px] text-white/50 ml-1">
            {remaining} / {limit} remaining
          </span>
        </div>

        {isAtLimit ? (
          <span className="text-[9px] font-mono text-white/35 flex-shrink-0">
            Resets {formatCountdown(countdown)}
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
  const { addTransientToast } = useNotifications();
  const storedUsages = useAppSelector((s) => s.sync.locationPowerUsages[outpost.id] ?? {});
  const [triggering, setTriggering] = useState<string | null>(null);
  const now = useNow(1000);
  const countdown = getSecondsUntilUtcMidnight(now);

  const uniqueEntry = getUniqueEntry(
    { nftAssetId: outpost.nftAssetId },
    outpost.definition || { rules: outpost.rules },
  );

  const powers: PowerRef[] = uniqueEntry?.powers ?? [];

  const today = getUtcDay();

  const usageByPower = useMemo<Record<string, number>>(() => {
    const result: Record<string, number> = {};
    for (const p of powers) {
      const k = powerKey(p);
      const entry = storedUsages[k];
      result[k] = entry && entry.lastUsedUtcDay === today ? entry.usageCount : 0;
    }
    return result;
  }, [storedUsages, powers, today]);


  const handleTrigger = useCallback(
    async (key: string) => {
      if (triggering) return;
      setTriggering(key);
      try {
        const res = await execute('TriggerLocationPower', { locationId: outpost.id, powerKey: key });
        const toast = res.ui.find((u: UiIntent) => u.type === 'toast') as Extract<UiIntent, { type: 'toast' }> | undefined;
        if (toast) {
          addTransientToast({
            title: toast.tone === 'success' ? 'Power Activated!' : 'Error',
            body: toast.message,
            icon: toast.tone === 'success' ? '⚡' : '❌',
            accentColor: toast.tone === 'success' ? '#F59E0B' : '#EF4444',
            durationMs: 8000,
          });
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to activate power';
        const isLimit = msg.includes('Daily limit') || msg.includes('limit reached');
        addTransientToast({
          title: isLimit ? 'Daily Limit Reached' : 'Power Failed',
          body: msg,
          icon: '❌',
          accentColor: '#EF4444',
          durationMs: 8000,
        });
      } finally {
        setTriggering(null);
      }
    },
    [outpost.id, execute, addTransientToast, triggering],
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
        const usageCount = usageByPower[k] ?? 0;
        const limit = typeof p.dailyLimit === 'number' && p.dailyLimit > 0 ? p.dailyLimit : 1;
        const isAtLimit = usageCount >= limit;
        return (
          <PowerRow
            key={k}
            power={p}
            usageCount={usageCount}
            isAtLimit={isAtLimit}
            isBusy={!!triggering}
            countdown={countdown}
            onTrigger={handleTrigger}
          />
        );
      })}
    </Card>
  );
}
