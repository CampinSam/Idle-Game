interface MissionStatsPanelProps {
  missionPower: number;
  difficulty: number;
  successChance: number;
  injuryChance: number;
  injuryRate: number;
  powerRatio: number;
  hasSynergyBonus?: boolean;
  loading?: boolean;
  isSticky?: boolean;
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
  isSticky = false,
}: MissionStatsPanelProps) {
  const successColor = successChance >= 70 ? '#10B981' : successChance >= 40 ? '#F59E0B' : '#EF4444';
  const injuryColor = injuryChance >= 60 ? '#EF4444' : '#F59E0B';

  const bar = (
    <div className="flex h-2 rounded-full overflow-hidden bg-black/40">
      <div
        className="h-full bg-gradient-to-r from-[#10b981] to-[#34d399] transition-[width] duration-300"
        style={{ width: `${Number((powerRatio * 100).toFixed(2))}%` }}
      />
      <div
        className="h-full bg-gradient-to-r from-[#ef4444] to-[#f87171] transition-[width] duration-300"
        style={{ width: `${Number(((1 - powerRatio) * 100).toFixed(2))}%` }}
      />
    </div>
  );

  if (isSticky) {
    return (
      <div className="rounded-xl border border-[rgba(139,92,246,0.18)] bg-black/20 px-3 py-2 flex flex-col gap-1.5">
        {loading && missionPower === 0 ? (
          <div className="text-[11px] text-text-secondary animate-pulse text-center">…</div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-1">
              {hasSynergyBonus && <span className="text-[11px] leading-none">⚡</span>}
              <span className="text-[11px] font-extrabold tracking-wide text-text-secondary uppercase flex-shrink-0">MP</span>
              <span className="flex-1 text-center text-[13px] font-extrabold tabular-nums" style={{ color: successColor }}>
                {successChance}%
              </span>
              <span className="text-[11px] font-extrabold tracking-wide text-text-secondary uppercase flex-shrink-0">D</span>
            </div>
            {bar}
          </>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[rgba(139,92,246,0.18)] bg-black/20 p-3 flex flex-col gap-2">
      <div className="text-[11px] font-extrabold tracking-[0.08em] uppercase text-[#c4b5fd]">Team Power vs Difficulty</div>
      <div className="flex flex-col gap-2">
        {loading && missionPower === 0 ? (
          <div className="text-[11px] text-text-secondary animate-pulse py-2 text-center">Calculating…</div>
        ) : (
          <>
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-cinzel text-[22px] font-black text-[#10b981] tabular-nums flex items-baseline gap-1">
                {hasSynergyBonus && <span className="text-[16px] leading-none">⚡</span>}
                {Number(missionPower.toFixed(2))}
              </span>
              <span className="text-[13px] font-bold text-text-secondary">vs</span>
              <span className="font-cinzel text-[22px] font-black text-[#ef4444] tabular-nums">
                {Number(difficulty.toFixed(2))}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold tracking-wide text-text-secondary uppercase">MP</span>
              <span className="text-[13px] font-extrabold tabular-nums" style={{ color: successColor }}>
                {successChance}%
              </span>
              <span className="text-[10px] font-bold tracking-wide text-text-secondary uppercase">D</span>
            </div>
            {bar}
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
