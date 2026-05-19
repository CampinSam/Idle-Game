import { useState, useEffect } from 'react';
import { useGlobalPowers } from '../../hooks/useSyncSelectors';
import type { GlobalPowerSnapshot } from '../../store/syncSlice';
import { Card, SectionHeader } from '../../components/ui';
import {
  getPowerTypeLabel,
  getPowerIcon,
  formatPowerValue,
  formatCountdown,
} from '../../utils/globalPowerUtils';

function BuffRow({ power }: { power: GlobalPowerSnapshot }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const icon = getPowerIcon(power);
  const typeLabel = getPowerTypeLabel(power);
  const valueLabel = formatPowerValue(power.value, power.valueMode);
  const countdown = formatCountdown(power.endTime);

  return (
    <div className="flex items-center gap-2.5 py-2 border-b border-white/5 last:border-b-0">
      <span className="text-lg w-7 text-center flex-shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-semibold text-white truncate">{power.label}</div>
        <div className="text-[11px] text-text-secondary mt-0.5">
          {typeLabel}: <span className="text-amber-400 font-bold">{valueLabel}</span>
        </div>
      </div>
      <div className="text-[11px] text-text-secondary font-mono flex-shrink-0 tabular-nums">
        {countdown}
      </div>
    </div>
  );
}

export function GlobalBuffsSection() {
  const globalPowers = useGlobalPowers();

  if (globalPowers.length === 0) return null;

  return (
    <Card className="mb-4">
      <div className="px-4 py-3">
        <SectionHeader title="⚡ Global Powers Active" />
        <div className="mt-2">
          {globalPowers.map((p) => (
            <BuffRow key={p.id} power={p} />
          ))}
        </div>
      </div>
    </Card>
  );
}
