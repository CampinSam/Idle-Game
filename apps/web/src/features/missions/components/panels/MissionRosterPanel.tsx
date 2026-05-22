interface RosterEntity {
  id: string;
  name: string;
  level: number;
  imageUrl?: string;
  missionPowerContrib?: number;
}

interface MissionRosterPanelProps {
  entities: RosterEntity[];
}

export function MissionRosterPanel({ entities }: MissionRosterPanelProps) {
  if (entities.length === 0) return null;

  const panelClass = 'rounded-xl border border-[rgba(139,92,246,0.18)] bg-black/20 p-3 flex flex-col gap-2';
  const panelTitleClass = 'text-[11px] font-extrabold tracking-[0.08em] uppercase text-[#c4b5fd]';

  return (
    <div className={panelClass}>
      <div className={panelTitleClass}>Team</div>
      <div className="flex flex-col gap-1.5">
        {entities.map((e) => (
          <div key={e.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06]">
            {e.imageUrl ? (
              <img
                src={e.imageUrl}
                alt={e.name}
                className="w-7 h-7 rounded-full object-cover flex-shrink-0 border border-white/10"
              />
            ) : (
              <span className="text-[14px] leading-none flex-shrink-0">⚔️</span>
            )}
            <span className="flex-1 text-[13px] font-bold text-text-primary truncate">{e.name}</span>
            {e.missionPowerContrib != null && (
              <span className="text-[11px] font-extrabold text-[#10b981] tabular-nums flex-shrink-0">
                ⚡{Number(e.missionPowerContrib.toFixed(1))}
              </span>
            )}
            <span className="text-[11px] font-semibold text-text-secondary flex-shrink-0">Lv {e.level}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
