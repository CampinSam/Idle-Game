import type { SynergyPreview, SynergyMatchedRule } from '../../../services/api';

interface SynergyPanelProps {
  synergyPreview: SynergyPreview;
  onDismiss: () => void;
}

function formatBonus(value: number, suffix: string): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${Number(value.toFixed(1))}${suffix}`;
}

function buildRuleEffectLabel(rule: SynergyMatchedRule): string | null {
  const parts: string[] = [];
  if (rule.scoreContrib !== 0) parts.push(formatBonus(rule.scoreContrib, ' pts'));
  if (rule.mpBonusContrib !== 0) parts.push(`MP ${formatBonus(rule.mpBonusContrib, '%')}`);
  if (rule.durationBonusContrib !== 0) parts.push(`Dur ${formatBonus(rule.durationBonusContrib, '%')}`);
  return parts.length > 0 ? parts.join(' · ') : null;
}

function RuleRow({ rule }: { rule: SynergyMatchedRule }) {
  const icon = rule.isPenalty ? '💀' : '⚡';
  const color = rule.isPenalty ? '#ef4444' : '#10b981';
  const borderColor = rule.isPenalty ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.15)';
  const bgColor = rule.isPenalty ? 'rgba(239,68,68,0.06)' : 'rgba(16,185,129,0.05)';
  const effectLabel = buildRuleEffectLabel(rule);

  return (
    <div
      className="flex items-center gap-2 px-2.5 py-2 rounded-lg border"
      style={{ background: bgColor, borderColor }}
    >
      <span className="text-base leading-none flex-shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-[12px] font-bold text-text-primary truncate">{rule.name}</div>
        {rule.applications > 1 && (
          <div className="text-[10px] text-text-secondary">×{rule.applications} applications</div>
        )}
      </div>
      {effectLabel && (
        <span className="text-[11px] font-extrabold tabular-nums flex-shrink-0" style={{ color }}>
          {effectLabel}
        </span>
      )}
    </div>
  );
}

export function SynergyPanel({ synergyPreview, onDismiss }: SynergyPanelProps) {
  const { matchedRules, synergyScore, missionPowerBonus, durationBonus } = synergyPreview;
  const hasRules = matchedRules.length > 0;
  const hasBonuses = missionPowerBonus !== 0 || durationBonus !== 0;
  const scoreColor = synergyScore > 0 ? '#10b981' : synergyScore < 0 ? '#ef4444' : '#94a3b8';

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-[rgba(10,6,30,0.96)] rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-3 border-b border-[rgba(139,92,246,0.25)]">
        <div>
          <h2 className="m-0 font-cinzel text-[18px] font-black tracking-wide text-white">
            Mission Launched!
          </h2>
          <p className="m-0 text-[12px] text-text-secondary mt-0.5">Synergy analysis for your team</p>
        </div>
        <span className="text-[32px]">🚀</span>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-[rgba(139,92,246,0.18)] bg-black/20 p-3 flex flex-col gap-1">
            <div className="text-[10px] font-extrabold tracking-[0.08em] uppercase text-[#c4b5fd]">Synergy Score</div>
            <div className="font-cinzel text-[28px] font-black tabular-nums leading-none mt-1" style={{ color: scoreColor }}>
              {synergyScore > 0 ? '+' : ''}{synergyScore}
            </div>
          </div>

          <div className="rounded-xl border border-[rgba(139,92,246,0.18)] bg-black/20 p-3 flex flex-col gap-1.5">
            <div className="text-[10px] font-extrabold tracking-[0.08em] uppercase text-[#c4b5fd]">Bonuses Applied</div>
            {hasBonuses ? (
              <div className="flex flex-col gap-1">
                {missionPowerBonus !== 0 && (
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="text-text-secondary">MP Bonus</span>
                    <span
                      className="font-extrabold tabular-nums"
                      style={{ color: missionPowerBonus > 0 ? '#10b981' : '#ef4444' }}
                    >
                      {formatBonus(missionPowerBonus, '%')}
                    </span>
                  </div>
                )}
                {durationBonus !== 0 && (
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="text-text-secondary">Duration</span>
                    <span
                      className="font-extrabold tabular-nums"
                      style={{ color: durationBonus < 0 ? '#10b981' : '#ef4444' }}
                    >
                      {formatBonus(durationBonus, '%')}
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <span className="text-[12px] text-text-secondary italic mt-0.5">None</span>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-[rgba(139,92,246,0.18)] bg-black/20 p-3 flex flex-col gap-2">
          <div className="text-[11px] font-extrabold tracking-[0.08em] uppercase text-[#c4b5fd]">
            Matched Rules
            {hasRules && (
              <span className="ml-1.5 text-white/40 font-normal normal-case tracking-normal">
                ({matchedRules.length})
              </span>
            )}
          </div>
          {hasRules ? (
            <div className="flex flex-col gap-1.5">
              {matchedRules.map((rule) => (
                <RuleRow key={rule.ruleId} rule={rule} />
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06]">
              <span className="text-base leading-none">🔮</span>
              <span className="text-[12px] text-text-secondary italic">
                No synergy rules matched for this team
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="p-3 border-t border-[rgba(139,92,246,0.18)] bg-black/20">
        <button
          onClick={onDismiss}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-white font-extrabold text-[13px] uppercase tracking-wide border border-[rgba(167,139,250,0.55)] bg-gradient-to-br from-[#8b5cf6] to-[#6d28d9] hover:brightness-110 cursor-pointer"
        >
          Continue ✓
        </button>
      </div>
    </div>
  );
}
