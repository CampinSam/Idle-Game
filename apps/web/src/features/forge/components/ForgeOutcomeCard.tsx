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
      className="rounded-[14px] border border-[rgba(139,92,246,0.2)] p-3 flex flex-col gap-2 min-h-[148px]"
      style={{ background: 'linear-gradient(160deg,#1a1640 0%,#1e1850 100%)' }}
    >
      <div className="text-[9px] font-extrabold tracking-[0.12em] uppercase text-[#93c5fd]">
        Outcome
      </div>

      {/* Success chance headline */}
      <div className="flex flex-col leading-none">
        <div className="text-[9px] font-bold uppercase tracking-[0.1em] text-text-secondary">
          Success
        </div>
        <div
          className="text-[32px] font-black tabular-nums leading-none"
          style={{ color: passRateColor }}
        >
          {passRatePct != null ? `${passRatePct}%` : '—'}
        </div>
      </div>

      {/* Divider */}
      <div className="h-px bg-white/10 w-full flex-shrink-0" />

      {/* Bell curve chart — fills remaining height */}
      <div className="flex-1 min-h-0 flex flex-col justify-end">
        <RarityCurveChart
          recipeTiers={recipeTiers}
          entityCl={entityCl}
          centerOverrides={centerOverrides}
          className="rounded overflow-hidden"
        />
      </div>
    </div>
  );
}
