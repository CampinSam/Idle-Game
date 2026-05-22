interface MissionStatsPanelProps {
  missionPower: number;
  difficulty: number;
  successChance: number;
  injuryChance: number;
  injuryRate: number;
  powerRatio: number;
  hasSynergyBonus?: boolean;
  loading?: boolean;
}

export function MissionStatsPanel({
  missionPower,
  difficulty,
  successChance,
  injuryChance,
  injuryRate,
  powerRatio,
  hasSynergyBonus,
  loading,
}: MissionStatsPanelProps) {
  const successColor = successChance >= 70 ? '#10B981' : successChance >= 40 ? '#F59E0B' : '#EF4444';
  const injuryColor = injuryChance >= 60 ? '#EF4444' : '#F59E0B';

  const panelClass = 'rounded-xl border border-[rgba(139,92,246,0.18)] bg-black/20 p-3 flex flex-col gap-2';
  const panelTitleClass = 'text-[11px] font-extrabold tracking-[0.08em] uppercase text-[#c4b5fd]';

  return (
    <div className={panelClass}>
      <div className={panelTitleClass}>Team Power vs Difficulty</div>
      <div className="flex flex-col gap-2">
        {loading && missionPower === 0 ? (
          <div className="text-[11px] text-text-secondary animate-pulse py-2 text-center">Calculating…</div>
        ) : (
          <>
            <div className="flex items-baseline justify-between gap-2">
              <div className="flex flex-col items-start">
                <span className="font-cinzel text-[22px] font-black text-[#10b981] tabular-nums flex items-baseline gap-1">
                  {hasSynergyBonus && (
                    <span className="text-[16px] leading-none">⚡</span>
                  )}
                  {Number(missionPower.toFixed(2))}
                </span>
                <span className="text-[10px] font-bold tracking-wide text-text-secondary uppercase">MP</span>
              </div>
              <div className="text-[12px] font-extrabold text-text-secondary uppercase tracking-widest">vs</div>
              <div className="flex flex-col items-end">
                <span className="font-cinzel text-[22px] font-black text-[#ef4444] tabular-nums">{Number(difficulty.toFixed(2))}</span>
                <span className="text-[10px] font-bold tracking-wide text-text-secondary uppercase">D</span>
              </div>
            </div>
            <div className="flex h-2 rounded-full overflow-hidden bg-black/40">
              <div className="h-full bg-gradient-to-r from-[#10b981] to-[#34d399] transition-[width] duration-300" style={{ width: `${Number((powerRatio * 100).toFixed(2))}%` }} />
              <div className="h-full bg-gradient-to-r from-[#ef4444] to-[#f87171] transition-[width] duration-300" style={{ width: `${Number(((1 - powerRatio) * 100).toFixed(2))}%` }} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-bold tracking-wide text-text-secondary uppercase">Success Chance</span>
              <span className="text-[16px] font-extrabold tabular-nums" style={{ color: successColor }}>{successChance}%</span>
            </div>
            {injuryRate > 0 && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-bold tracking-wide text-text-secondary uppercase">Injury Risk</span>
                <span className="text-[13px] font-extrabold tabular-nums" style={{ color: injuryColor }}>{injuryChance}%</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
