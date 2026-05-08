import ItemQty from '../../../components/ItemQty';
import { formatDuration, type ReqStatusEntry } from './missionUtils';

interface MissionDetailFooterProps {
  currentCat: any;
  diffInfo: { tier: string; label: string; color: string };
  duration: number;
  difficulty: number;
  teamMin: number;
  teamMax: number;
  keeperLvl: number;
  reqStatus: ReqStatusEntry[];
  missionCost: Array<{ type: string; id: string; amount: number }>;
  getHaveForEntry: (entry: { type: string; id: string }) => number;
  error: string;
}

const REQ_TONE: Record<'met' | 'warn' | 'fail' | 'neutral', string> = {
  met: 'text-[#34d399]',
  warn: 'text-[#fbbf24]',
  fail: 'text-[#f87171]',
  neutral: 'text-text-secondary',
};

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[rgba(139,92,246,0.18)] bg-black/20 p-3 flex flex-col gap-2">
      <div className="text-[11px] font-extrabold tracking-[0.08em] uppercase text-[#c4b5fd]">{title}</div>
      {children}
    </div>
  );
}

export function MissionDetailFooter({
  currentCat,
  diffInfo,
  duration,
  difficulty,
  teamMin,
  teamMax,
  keeperLvl,
  reqStatus,
  missionCost,
  getHaveForEntry,
  error,
}: MissionDetailFooterProps) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Panel title="Requirements">
          <div className="flex flex-col gap-1.5">
            {reqStatus.length > 0
              ? reqStatus.map((r, i) => {
                  const isTrait = r.type === 'trait';
                  const state: 'met' | 'warn' | 'fail' = r.met ? 'met' : isTrait ? 'warn' : 'fail';
                  const icon = state === 'met' ? '✅' : state === 'warn' ? '⚠️' : '❌';
                  return (
                    <div key={i} className={`flex items-center gap-2 text-[12px] ${REQ_TONE[state]}`}>
                      <span className="text-base leading-none">{icon}</span>
                      <span className="flex-1 truncate">{r.label || r.type}</span>
                    </div>
                  );
                })
              : (
                <>
                  {teamMin > 1 && (
                    <div className={`flex items-center gap-2 text-[12px] ${REQ_TONE.neutral}`}>
                      <span className="text-base leading-none">👥</span>
                      <span>Team: {teamMin}–{teamMax} entities</span>
                    </div>
                  )}
                  {keeperLvl > 0 && (
                    <div className={`flex items-center gap-2 text-[12px] ${REQ_TONE.neutral}`}>
                      <span className="text-base leading-none">🛡️</span>
                      <span>Keeper Lv {keeperLvl}+</span>
                    </div>
                  )}
                  {teamMin <= 1 && keeperLvl === 0 && (
                    <span className="text-[12px] text-text-secondary italic">No special requirements</span>
                  )}
                </>
              )
            }
          </div>
        </Panel>

        <Panel title="Mission Details">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2 text-[12px]">
              <span className="text-text-secondary">Category</span>
              <span className="font-bold text-text-primary truncate">{currentCat.name}</span>
            </div>
            <div className="flex items-center justify-between gap-2 text-[12px]">
              <span className="text-text-secondary">Difficulty</span>
              <span className="font-bold" style={{ color: diffInfo.color }}>{diffInfo.tier} · {difficulty}</span>
            </div>
            <div className="flex items-center justify-between gap-2 text-[12px]">
              <span className="text-text-secondary">Duration</span>
              <span className="font-bold text-text-primary">{formatDuration(duration)}</span>
            </div>
            <div className="flex items-center justify-between gap-2 text-[12px]">
              <span className="text-text-secondary">Team Size</span>
              <span className="font-bold text-text-primary">{teamMin === teamMax ? teamMax : `${teamMin}–${teamMax}`}</span>
            </div>
            {missionCost.length > 0 && (
              <div className="flex items-center justify-between gap-2 text-[12px]">
                <span className="text-text-secondary">Cost</span>
                <span className="font-bold text-text-primary">
                  <span className="flex flex-wrap gap-1.5 justify-end">
                    {missionCost.map((entry, i) => {
                      const have = getHaveForEntry(entry);
                      const canAffordEntry = have >= entry.amount;
                      return (
                        <span
                          key={i}
                          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded ${
                            canAffordEntry
                              ? 'bg-black/30 text-white/90'
                              : 'bg-[rgba(239,68,68,0.15)] border border-[rgba(239,68,68,0.35)] text-[#fca5a5]'
                          }`}
                        >
                          <ItemQty src={entry.id} amount={entry.amount} size={13} />
                        </span>
                      );
                    })}
                  </span>
                </span>
              </div>
            )}
          </div>
        </Panel>
      </div>

      {error && (
        <div className="mt-2 px-3 py-2 rounded-md bg-[rgba(239,68,68,0.12)] border border-[rgba(239,68,68,0.4)] text-[#fecaca] text-xs">
          {error}
        </div>
      )}
    </>
  );
}
