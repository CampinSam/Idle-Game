import { createCountdownTimer } from '../../../tick';
import { GameImage } from '../../../components/GameImage';
import { getEntityImagePath } from '../../../config/images';
import { fmtSeconds } from './forgeUtils';

interface ForgeJobRowProps {
  job: any;
  entities: any[];
  craftingRecipes: any[];
  tick: number;
  tickRate: number;
  focusedJobId: string;
  focusedJobRef: React.RefObject<HTMLDivElement>;
  onCollect: (jobId: string) => void;
}

const TIER_RING: Record<string, string> = {
  'tier-1': 'stroke-[#a78bfa]',
  'tier-2': 'stroke-[#60a5fa]',
  'tier-3': 'stroke-[#fcd34d]',
};

export function ForgeJobRow({
  job,
  entities,
  craftingRecipes,
  tick,
  tickRate,
  focusedJobId,
  focusedJobRef,
  onCollect,
}: ForgeJobRowProps) {
  const timer = (job.startTick != null && job.durationTicks != null)
    ? createCountdownTimer({ startTick: job.startTick, durationTicks: job.durationTicks })
    : null;
  const remTicks = timer ? timer.getValue(tick) : Infinity;
  const remMs = timer && tickRate > 0 ? (remTicks / tickRate) * 1000 : Infinity;
  const isReady = remMs <= 0;
  const recipeDef = craftingRecipes.find((r: any) => r.id === job.recipeId);
  const entity = entities.find((e: any) => e.id === job.entityId);
  const entityName = entity?.name || 'Derp';
  const portraitInitial = entityName.trim().charAt(0).toUpperCase() || '?';
  const recipeTier = Number(recipeDef?.tier ?? 1);
  const tierKey = recipeTier >= 3 ? 'tier-3' : recipeTier >= 2 ? 'tier-2' : 'tier-1';
  const totalDurationTicks = Number(job.durationTicks ?? 0);
  const elapsedTicks = totalDurationTicks - (Number.isFinite(remTicks) ? Math.max(0, remTicks) : totalDurationTicks);
  const progress = totalDurationTicks > 0 ? Math.min(1, Math.max(0, elapsedTicks / totalDurationTicks)) : (isReady ? 1 : 0);
  const ringCircumference = 2 * Math.PI * 28;
  const ringDashOffset = ringCircumference * (1 - progress);
  const isFocused = focusedJobId && job.id === focusedJobId;

  return (
    <div
      ref={isFocused ? focusedJobRef : null}
      className={`flex items-center gap-3 p-3 rounded-xl border bg-gradient-to-br from-[#1a1640] to-[#221a50] transition-colors ${
        isReady
          ? 'border-[rgba(52,211,153,0.5)] shadow-[0_0_18px_-6px_rgba(16,185,129,0.55)]'
          : 'border-[rgba(139,92,246,0.22)]'
      } ${isFocused ? 'ring-2 ring-[rgba(167,139,250,0.55)]' : ''}`}
    >
      <div className="relative w-16 h-16 flex-shrink-0">
        <div className="absolute inset-1 rounded-full overflow-hidden bg-black/40 flex items-center justify-center">
          {entity?.imageUrl ? (
            <GameImage
              src={getEntityImagePath(entity.id, entity.archetype, entity.imageUrl, 'thumb')}
              category="entities"
              alt={entityName}
              className="w-full h-full object-cover"
              rounded
            />
          ) : (
            <span className="text-[22px] font-black text-[#c4b5fd]">{portraitInitial}</span>
          )}
        </div>
        <svg className="absolute inset-0 -rotate-90" width="64" height="64" viewBox="0 0 64 64" aria-hidden="true">
          <circle cx="32" cy="32" r="28" fill="none" strokeWidth="3" className="stroke-white/10" />
          <circle
            cx="32"
            cy="32"
            r="28"
            fill="none"
            strokeWidth="3"
            strokeLinecap="round"
            className={`transition-[stroke-dashoffset] duration-300 ${TIER_RING[tierKey]}`}
            strokeDasharray={ringCircumference}
            strokeDashoffset={ringDashOffset}
          />
        </svg>
      </div>
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <div className={`text-[10px] font-extrabold uppercase tracking-[0.08em] ${isReady ? 'text-[#34d399]' : 'text-[#c4b5fd]'}`}>
          {isReady ? '✓ Ready to collect' : 'Crafting in progress'}
        </div>
        <div className="text-[14px] font-bold text-[#f5f3ff] truncate">{recipeDef?.name || job.recipeId}</div>
        <div className="text-[11px] text-text-secondary truncate">{entityName}</div>
      </div>
      {isReady ? (
        <button
          onClick={() => onCollect(job.id)}
          data-sfx="ui.button_primary"
          className="px-3.5 py-2 rounded-lg text-white text-[12px] font-extrabold uppercase tracking-[0.06em] cursor-pointer hover:brightness-110"
          style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
        >
          Collect
        </button>
      ) : (
        <span className="text-[12px] font-bold text-[#fbbf24] tabular-nums whitespace-nowrap">
          {fmtSeconds(remMs / 1000)} left
        </span>
      )}
    </div>
  );
}
