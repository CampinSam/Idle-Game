import type { ModalBlockEntityRoster } from '@derp/shared';

export default function EntityRosterBlock({ block }: { block: ModalBlockEntityRoster }) {
  const { entities } = block;
  if (!entities || entities.length === 0) return null;

  const hasOutcome = entities.some((e) => e.outcome != null);
  const title = hasOutcome ? 'Team Outcomes' : 'Team';

  return (
    <div className="rounded-xl border border-[rgba(139,92,246,0.18)] bg-black/20 p-3 flex flex-col gap-2">
      <div className="text-[11px] font-extrabold tracking-[0.08em] uppercase text-[#c4b5fd]">{title}</div>
      <div className="flex flex-col gap-1.5">
        {entities.map((e, i) => (
          <div
            key={e.id}
            className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06] motion-safe:animate-[outcome-row-in_0.3s_ease-out_both]"
            style={{ animationDelay: `${0.05 + i * 0.06}s` }}
          >
            {e.portraitKey ? (
              <img
                src={e.portraitKey}
                alt={e.name}
                className="w-7 h-7 rounded-full object-cover flex-shrink-0 border border-white/10"
              />
            ) : (
              <span className="text-[14px] leading-none flex-shrink-0">
                {e.outcome?.injured ? '🩹' : '⚔️'}
              </span>
            )}
            <span className="flex-1 text-[13px] font-bold text-text-primary truncate">{e.name}</span>

            {e.outcome ? (
              <span className="flex flex-col items-end gap-0.5">
                {e.outcome.levelAfter > e.outcome.levelBefore && (
                  <span className="text-[11px] font-extrabold text-[#fbbf24]">
                    Lv {e.outcome.levelBefore} → {e.outcome.levelAfter} ⬆️
                  </span>
                )}
                {e.outcome.injured && (
                  <span className="text-[11px] font-extrabold text-[#ef4444]">Injured 🩹</span>
                )}
                {e.outcome.xpGained > 0 && (
                  <span className="text-[10px] text-text-secondary">+{e.outcome.xpGained} XP</span>
                )}
              </span>
            ) : (
              <>
                {e.powerContribution != null && (
                  <span className="text-[11px] font-extrabold text-[#10b981] tabular-nums flex-shrink-0">
                    ⚡{e.powerContribution.toFixed(1)}
                  </span>
                )}
                <span className="text-[11px] font-semibold text-text-secondary flex-shrink-0">
                  Lv {e.level}
                </span>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
