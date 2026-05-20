import { RarityCurveChart } from './RarityCurveChart';

interface ForgeOutcomeCardProps {
  passRatePct: number | null;
  passRateColor: string;
  entityCl?: number | null;
  recipeTiers?: Record<string, any> | null;
  centerOverrides?: Partial<Record<string, number>>;
}

export function ForgeOutcomeCard({
  passRatePct,
  passRateColor,
  entityCl,
  recipeTiers,
  centerOverrides = {},
}: ForgeOutcomeCardProps) {
  return (
    <div
      className="rounded-[14px] border border-[rgba(139,92,246,0.2)] p-3 flex flex-col gap-2 self-stretch"
      style={{ background: 'linear-gradient(160deg,#1a1640 0%,#1e1850 100%)' }}
    >
      {/* Success chance — label left, value right on same line */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold tracking-wide text-text-secondary uppercase">
          Success Chance
        </span>
        <span
          className="text-[16px] font-extrabold tabular-nums"
          style={{ color: passRateColor }}
        >
          {passRatePct != null ? `${passRatePct}%` : '—'}
        </span>
      </div>

      {/* Divider */}
      <div className="h-px bg-white/10 w-full flex-shrink-0" />

      {/* Bell curve chart — fills remaining height */}
      <div className="flex-1 min-h-0">
        <RarityCurveChart
          recipeTiers={recipeTiers}
          entityCl={entityCl}
          centerOverrides={centerOverrides}
          className="rounded overflow-hidden w-full h-full"
        />
      </div>
    </div>
  );
}
