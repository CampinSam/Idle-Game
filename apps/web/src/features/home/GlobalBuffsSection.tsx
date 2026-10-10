import { useNow } from '../../hooks/useNow';
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
  const now = useNow(1000);
  const icon = getPowerIcon(power);
  const typeLabel = getPowerTypeLabel(power);
  const valueLabel = formatPowerValue(power.value, power.valueMode);
  const countdown = formatCountdown(power.endTime, now);

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

export function GlobalBuffsSection({ maxItems }: { maxItems?: number }) {
  const globalPowers = useGlobalPowers();
  const displayed = maxItems != null ? globalPowers.slice(0, maxItems) : globalPowers;

  if (globalPowers.length === 0) return null;

  return (
    <Card className="mb-4">
      <div className="px-4 py-3">
        <SectionHeader title="⚡ Global Powers Active" />
        <div className="mt-2">
          {displayed.map((p) => (
            <BuffRow key={p.id} power={p} />
          ))}
          {maxItems != null && globalPowers.length > maxItems && (
            <div className="text-[11px] text-text-secondary pt-1">
              +{globalPowers.length - maxItems} more
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
