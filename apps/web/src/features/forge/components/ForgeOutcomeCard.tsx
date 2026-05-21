import { RarityCurveChart } from './RarityCurveChart';
import { QUALITY_COLOURS } from './forgeUtils';

interface QualityProbEntry {
  key: string;
  label: string;
  probability: number;
}

interface ForgeOutcomeCardProps {
  passRatePct: number | null;
  passRateColor: string;
  entityCl?: number | null;
  recipeTiers?: Record<string, any> | null;
  centerOverrides?: Partial<Record<string, number>>;
  qualityProbabilities?: QualityProbEntry[] | null;
}

export function ForgeOutcomeCard({
  passRatePct,
  passRateColor,
  entityCl,
  recipeTiers,
  centerOverrides = {},
  qualityProbabilities,
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

      {/* Bell curve chart */}
      <RarityCurveChart
        recipeTiers={recipeTiers}
        entityCl={entityCl}
        centerOverrides={centerOverrides}
        className="rounded overflow-hidden w-full"
      />

      {/* Quality probability pills */}
      {qualityProbabilities && qualityProbabilities.length > 0 && (
        <>
          <div className="h-px bg-white/10 w-full flex-shrink-0" />
          <div className="flex flex-col gap-0.5">
            {qualityProbabilities.map((entry) => {
              const color = QUALITY_COLOURS[entry.key] ?? '#94a3b8';
              const pct = Math.round(entry.probability * 100);
              if (pct === 0) return null;
              return (
                <div key={entry.key} className="flex items-center gap-1.5">
                  <span
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ background: color }}
                  />
                  <span
                    className="text-[9px] font-bold uppercase tracking-wide flex-1 truncate"
                    style={{ color }}
                  >
                    {entry.label}
                  </span>
                  <span className="text-[9px] font-bold tabular-nums text-white/70">
                    {pct}%
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
