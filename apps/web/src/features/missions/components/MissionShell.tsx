import { ReactNode } from 'react';
import { ANTI_WHALE_CAPS } from '@derp/shared';
import { EmptyState, SectionHeader } from '../../../components/ui';
import { useCurrentTick, useTickRate, createCountdownTimer } from '../../../tick';
import { formatTimeShort } from './missionUtils';

interface MissionShellProps {
  middle: ReactNode;
  activeMissions: any[];
  missionDefs: any[];
  missionHistory: any[];
  profile: any;
  activityCollapsed: boolean;
  onToggleActivity: () => void;
  onOpenJob: (jobId: string) => void;
  onCollect: (id: string) => void;
  completingId: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  ready: 'text-[#10B981]',
  'in-progress': 'text-[#F59E0B]',
  completed: 'text-[#10B981]',
  failed: 'text-[#ef4444]',
};

export function MissionShell({
  middle,
  activeMissions,
  missionDefs,
  missionHistory,
  profile,
  activityCollapsed,
  onToggleActivity,
  onOpenJob,
  onCollect,
  completingId,
}: MissionShellProps) {
  const currentTick = useCurrentTick();
  const tickRate = useTickRate();
  const hasHistory = missionHistory.length > 0;
  const collapsed = activityCollapsed && hasHistory;
  const maxSlots = ANTI_WHALE_CAPS.maxActiveMissions(profile?.keeperLevel ?? 1);
  const emptyCount = Math.max(0, maxSlots - activeMissions.length);

  return (
    <div className="flex flex-col gap-4">
      <section>
        <SectionHeader title="Mission Slots" />
        <div className="flex flex-col gap-2">
          {activeMissions.map((m: any) => {
            const timer = (m.startTick != null && m.durationTicks != null)
              ? createCountdownTimer({ startTick: m.startTick, durationTicks: m.durationTicks })
              : null;
            const remainingTicks = timer ? timer.getValue(currentTick) : Infinity;
            const remaining = timer && tickRate > 0 ? (remainingTicks / tickRate) * 1000 : Infinity;
            const isReady = remaining <= 0;
            const progress = (m.durationTicks && m.durationTicks > 0)
              ? Math.min(100, Math.max(2, ((m.durationTicks - remainingTicks) / m.durationTicks) * 100))
              : 2;
            return (
              <div
                key={m.id}
                onClick={() => onOpenJob(m.id)}
                className="cursor-pointer flex items-center gap-3 px-3 py-2.5 rounded-lg border border-[rgba(139,92,246,0.2)] bg-bg-card hover:border-[rgba(139,92,246,0.45)] transition-colors"
              >
                <span className="flex-1 min-w-0 text-[13px] font-bold text-text-primary truncate">
                  {missionDefs.find((d: any) => d.id === m.defId)?.name ?? m.defId ?? 'Unknown Mission'}
                </span>
                <span className={`text-[11px] font-bold tracking-wide whitespace-nowrap ${isReady ? STATUS_COLORS.ready : STATUS_COLORS['in-progress']}`}>
                  {isReady ? '✅ READY' : `⏱ ${formatTimeShort(remaining)}`}
                </span>
                {isReady ? (
                  <button
                    onClick={(e) => { e.stopPropagation(); onCollect(m.id); }}
                    disabled={completingId === m.id}
                    className="px-3 py-1 rounded-md text-[11px] font-extrabold tracking-wide text-white bg-gradient-to-br from-[#10b981] to-[#059669] hover:brightness-110 disabled:opacity-60"
                  >
                    {completingId === m.id ? '...' : 'COLLECT'}
                  </button>
                ) : (
                  <div className="w-24 h-1.5 rounded-full bg-black/40 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-[#a78bfa] to-[#8b5cf6] transition-[width] duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                )}
              </div>
            );
          })}
          {Array.from({ length: emptyCount }).map((_, i) => (
            <div
              key={`open-slot-${i}`}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-dashed border-white/15 bg-white/[0.02] text-text-secondary"
            >
              <span className="text-[18px] text-white/30 font-light">＋</span>
              <span className="text-[12px] font-semibold tracking-wide">Mission Available</span>
            </div>
          ))}
        </div>
      </section>

      <div>{middle}</div>

      <section>
        <button
          type="button"
          onClick={() => hasHistory && onToggleActivity()}
          disabled={!hasHistory}
          aria-expanded={!collapsed}
          className="w-full flex items-center justify-between gap-2 px-1 py-1 cursor-pointer disabled:cursor-default"
        >
          <SectionHeader title="Mission Activity" className="mb-0 px-0" />
          {hasHistory && (
            <span className="text-[10px] text-text-secondary" aria-hidden="true">
              {collapsed ? '▼' : '▲'}
            </span>
          )}
        </button>
        {!collapsed && (
          <div className="mt-2">
            {missionHistory.length === 0 ? (
              <EmptyState message="No mission activity yet." />
            ) : (
              <div className="flex flex-col gap-2">
                {missionHistory.slice(0, 5).map((m: any) => (
                  <div
                    key={m.id}
                    onClick={() => onOpenJob(m.id)}
                    className="cursor-pointer flex items-center gap-3 px-3 py-2.5 rounded-lg border border-white/[0.06] bg-white/[0.02] hover:border-white/15 transition-colors"
                  >
                    <span className="flex-1 min-w-0 text-[13px] font-bold text-text-primary truncate">
                      {missionDefs.find((d: any) => d.id === m.defId)?.name ?? m.defId ?? 'Unknown Mission'}
                    </span>
                    <span className={`text-[12px] ${STATUS_COLORS[m.status] || 'text-text-secondary'}`}>
                      {m.status === 'completed' ? '✅' : '❌'}
                    </span>
                    {(m.results?.rewards || m.result?.rewards) && (
                      <span className="text-[11px] text-text-secondary truncate max-w-[40%]">
                        {((m.results?.rewards || m.result?.rewards) as any[])
                          .map((r: any) => `+${r.amount} ${r.name || r.key || r.type}`)
                          .join(', ')}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
