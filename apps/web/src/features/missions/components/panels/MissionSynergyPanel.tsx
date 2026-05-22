interface SynergyRule {
  ruleId: string;
  name: string;
  applications: number;
  scoreContrib: number;
  mpBonusContrib: number;
  durationBonusContrib: number;
  isPenalty: boolean;
}

interface MissionSynergyPanelProps {
  matchedRules: SynergyRule[];
}

export function MissionSynergyPanel({ matchedRules }: MissionSynergyPanelProps) {
  if (matchedRules.length === 0) return null;

  return (
    <div className="rounded-xl border border-[rgba(139,92,246,0.25)] bg-black/20 px-3 py-2 flex flex-col gap-1">
      {matchedRules.map((rule) => {
        const color = rule.isPenalty ? '#ef4444' : '#10b981';
        const borderColor = rule.isPenalty ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.15)';
        const bgColor = rule.isPenalty ? 'rgba(239,68,68,0.06)' : 'rgba(16,185,129,0.05)';
        const parts: string[] = [];
        if (rule.scoreContrib !== 0) parts.push(`${rule.scoreContrib > 0 ? '+' : ''}${Number(rule.scoreContrib.toFixed(1))} pts`);
        if (rule.mpBonusContrib !== 0) parts.push(`MP ${rule.mpBonusContrib > 0 ? '+' : ''}${Number(rule.mpBonusContrib.toFixed(1))}%`);
        if (rule.durationBonusContrib !== 0) parts.push(`Dur ${rule.durationBonusContrib > 0 ? '+' : ''}${Number(rule.durationBonusContrib.toFixed(1))}%`);
        const label = parts.join(' · ');
        return (
          <div
            key={rule.ruleId}
            className="flex items-center gap-2 px-2 py-1.5 rounded-lg border"
            style={{ background: bgColor, borderColor }}
          >
            <span className="text-sm leading-none flex-shrink-0">{rule.isPenalty ? '💀' : '⚡'}</span>
            <span className="flex-1 text-[11px] font-bold text-text-primary truncate">{rule.name}</span>
            {rule.applications > 1 && (
              <span className="text-[10px] text-text-secondary flex-shrink-0">×{rule.applications}</span>
            )}
            {label && (
              <span className="text-[10px] font-extrabold tabular-nums flex-shrink-0" style={{ color }}>{label}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
