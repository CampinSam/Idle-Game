import { useState } from 'react';

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
  const [isCollapsed, setIsCollapsed] = useState(false);

  if (matchedRules.length === 0) return null;

  const bonusCount = matchedRules.filter((r) => !r.isPenalty).length;
  const penaltyCount = matchedRules.filter((r) => r.isPenalty).length;
  const netScore = matchedRules.reduce((s, r) => s + r.scoreContrib, 0);
  const netMp = matchedRules.reduce((s, r) => s + r.mpBonusContrib, 0);

  const summaryParts: string[] = [];
  if (netScore !== 0) summaryParts.push(`${netScore > 0 ? '+' : ''}${Number(netScore.toFixed(1))} pts`);
  if (netMp !== 0) summaryParts.push(`MP ${netMp > 0 ? '+' : ''}${Number(netMp.toFixed(1))}%`);
  const summaryLabel = summaryParts.join(' · ');
  const netPositive = netScore > 0 || netMp > 0;
  const summaryColor = penaltyCount > bonusCount ? '#ef4444' : netPositive ? '#10b981' : '#f59e0b';

  return (
    <div className="rounded-xl border border-[rgba(139,92,246,0.25)] bg-black/20 overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center gap-2 px-3 py-1.5 cursor-pointer"
        onClick={() => setIsCollapsed((c) => !c)}
      >
        {bonusCount > 0 && (
          <span className="text-[11px] font-bold text-[#10b981] flex-shrink-0">⚡{bonusCount}</span>
        )}
        {penaltyCount > 0 && (
          <span className="text-[11px] font-bold text-[#ef4444] flex-shrink-0">💀{penaltyCount}</span>
        )}
        <span className="flex-1 text-[10px] font-extrabold tabular-nums text-left" style={{ color: summaryColor }}>
          {summaryLabel || 'Synergies'}
        </span>
        <span className="text-[10px] text-text-secondary flex-shrink-0">{isCollapsed ? '▼' : '▲'}</span>
      </button>

      {!isCollapsed && (
        <div className="flex flex-col gap-1 px-3 pb-2">
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
      )}
    </div>
  );
}
