import ItemQty from '../../../../components/ItemQty';
import { useSurfaceContext } from '../../../content-document/SurfaceContext';

const PANEL_CLASS = 'rounded-xl border border-[rgba(139,92,246,0.18)] bg-black/20 p-3 flex flex-col gap-2';
const PANEL_TITLE_CLASS = 'text-[11px] font-extrabold tracking-[0.08em] uppercase text-[#c4b5fd]';
const ROW_LABEL_CLASS = 'text-[11px] font-semibold text-text-secondary';
const ROW_VALUE_CLASS = 'text-[12px] font-bold text-text-primary';

/**
 * Standalone details panel that reads from SurfaceContext data.
 * Registered as the `mission_requirements` content block type.
 * Shows: mission costs, non-team requirements, injury chance, and recovery time.
 */
export function MissionRequirementsBlock() {
  const { data } = useSurfaceContext();
  const requirements: Array<{ label?: string; met: boolean }> = data.previewRequirements ?? [];
  const loading: boolean = data.previewLoading ?? false;
  const missionCost: Array<{ type: string; id: string; amount: number }> = data.missionCost ?? [];
  const injuryChance: number = data.injuryChance ?? 0;
  const injuryRate: number = data.injuryRate ?? 0;
  const def: any = data.def;
  const injuryRecoveryTicks: number = def?.injuryRecoveryTicks ?? 0;

  const hasCosts = missionCost.length > 0;
  const hasRequirements = requirements.length > 0;
  const hasInjury = injuryRate > 0;
  const hasRecovery = injuryRecoveryTicks > 0;
  const hasAnything = hasCosts || hasRequirements || hasInjury || hasRecovery;

  return (
    <div className={PANEL_CLASS}>
      <div className={PANEL_TITLE_CLASS}>Details</div>

      {/* Costs */}
      {hasCosts && (
        <div className="flex flex-col gap-1">
          <span className={ROW_LABEL_CLASS}>Cost</span>
          <div className="flex flex-wrap gap-2">
            {missionCost.map((c, i) => (
              <ItemQty key={i} src={c.id} amount={c.amount} size={13} />
            ))}
          </div>
        </div>
      )}

      {/* Requirements */}
      {loading && !hasRequirements ? (
        <div className="flex flex-col gap-1.5">
          <div className="h-3.5 rounded bg-white/[0.06] animate-pulse w-4/5" />
          <div className="h-3.5 rounded bg-white/[0.06] animate-pulse w-3/5" />
        </div>
      ) : hasRequirements ? (
        <div className="flex flex-col gap-1.5">
          {requirements.map((r, i) => (
            <div key={i} className="flex items-center gap-2 text-[12px]">
              <span className="text-base leading-none flex-shrink-0">{r.met ? '✅' : '❌'}</span>
              <span
                className="flex-1 font-medium truncate"
                style={{ color: r.met ? '#10b981' : '#ef4444' }}
              >
                {r.label ?? 'Requirement'}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {/* Injury chance */}
      {hasInjury && (
        <div className="flex items-center justify-between gap-2">
          <span className={ROW_LABEL_CLASS}>Injury Chance</span>
          <span
            className={ROW_VALUE_CLASS}
            style={{ color: injuryChance >= 60 ? '#ef4444' : '#f59e0b' }}
          >
            {injuryChance}%
          </span>
        </div>
      )}

      {/* Recovery time */}
      {hasRecovery && (
        <div className="flex items-center justify-between gap-2">
          <span className={ROW_LABEL_CLASS}>Recovery Time</span>
          <span className={ROW_VALUE_CLASS}>{injuryRecoveryTicks} ticks</span>
        </div>
      )}

      {/* Empty state */}
      {!hasAnything && !loading && (
        <span className="text-[12px] text-text-secondary italic">No requirements</span>
      )}
    </div>
  );
}
