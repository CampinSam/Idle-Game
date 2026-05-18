import { ReactNode } from 'react';
import { ANTI_WHALE_CAPS } from '@derp/shared';
import { Card, EmptyState, SectionHeader } from '../../../components/ui';
import { createCountdownTimer, useCurrentTick } from '../../../tick';
import { useTickRemainingMs } from '../../../tick/useTickValue';
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

function MissionActiveRow({
  m,
  missionDefs,
  onOpenJob,
  onCollect,
  completingId,
}: {
  m: any;
  missionDefs: any[];
  onOpenJob: (id: string) => void;
  onCollect: (id: string) => void;
  completingId: string | null;
}) {
  const currentTick = useCurrentTick();
  const timer = (m.startTick != null && m.durationTicks != null)
    ? createCountdownTimer({ startTick: m.startTick, durationTicks: m.durationTicks })
    : null;
  const remaining = useTickRemainingMs(timer);
  const isReady = remaining <= 0;
  const remainingTicks = timer ? timer.getValue(currentTick) : 0;
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
}

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
  const hasHistory = missionHistory.length > 0;
  const collapsed = activityCollapsed && hasHistory;
  const maxSlots = ANTI_WHALE_CAPS.maxActiveMissions(profile?.keeperLevel ?? 1);
  const emptyCount = Math.max(0, maxSlots - activeMissions.length);

  return (
    <Card className="flex flex-col flex-1 min-h-0">
      {/* Mission Slots — sticky at top */}
      <section className="flex-shrink-0 p-3 border-b border-white/5">
        <SectionHeader title="Mission Slots" />
        <div className="flex flex-col gap-2">
          {activeMissions.map((m: any) => (
            <MissionActiveRow
              key={m.id}
              m={m}
              missionDefs={missionDefs}
              onOpenJob={onOpenJob}
              onCollect={onCollect}
              completingId={completingId}
            />
          ))}
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

      {/* Categories / mission list — scrollable middle */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3">
        {middle}
      </div>

      {/* Mission Activity — sticky at bottom, collapsible */}
      <section className="flex-shrink-0 border-t border-white/5">
        <button
          type="button"
          onClick={() => hasHistory && onToggleActivity()}
          disabled={!hasHistory}
          aria-expanded={!collapsed}
          className="w-full flex items-center justify-between gap-2 px-3 py-2 cursor-pointer disabled:cursor-default hover:bg-white/[0.02] transition-colors"
        >
          <SectionHeader title="Mission Activity" className="mb-0 px-0" />
          {hasHistory && (
            <span className="text-[10px] text-text-secondary" aria-hidden="true">
              {collapsed ? '▼' : '▲'}
            </span>
          )}
        </button>
        {!collapsed && (
          <div className="px-3 pb-3 max-h-[35vh] overflow-y-auto">
            {missionHistory.length === 0 ? (
              <EmptyState message="No mission activity yet." />
            ) : (
              <div className="flex flex-col gap-2">
                {missionHistory.slice(0, 5).map((m: any) => {
                  const histDefId = m.defId ?? m.missionDefId;
                  const histName = missionDefs.find((d: any) => d.id === histDefId)?.name ?? histDefId ?? 'Unknown Mission';
                  const isCompleted = m.status === 'completed';
                  return (
                    <div
                      key={m.id}
                      onClick={() => onOpenJob(m.id)}
                      className="cursor-pointer flex items-center gap-3 px-3 py-2.5 rounded-lg border border-[rgba(139,92,246,0.2)] bg-bg-card hover:border-[rgba(139,92,246,0.45)] transition-colors"
                    >
                      <span className="flex-1 min-w-0 text-[13px] font-bold text-text-primary truncate">
                        {histName}
                      </span>
                      <span className={`text-[11px] font-bold tracking-wide whitespace-nowrap ${isCompleted ? STATUS_COLORS.completed : STATUS_COLORS.failed}`}>
                        {isCompleted ? '✅ READY' : '❌ FAILED'}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </section>
    </Card>
  );
}
