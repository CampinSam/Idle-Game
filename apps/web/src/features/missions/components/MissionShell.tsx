import { ReactNode, useState } from 'react';
import { ANTI_WHALE_CAPS } from '@derp/shared';
import { Card, EmptyState, SectionHeader } from '../../../components/ui';
import JobProgressBar from '../../../components/JobProgressBar';

interface MissionShellProps {
  middle: ReactNode;
  activeMissions: any[];
  missionDefs: any[];
  missionHistory: any[];
  profile: any;
  activityCollapsed: boolean;
  onToggleActivity: () => void;
  onOpenJob: (jobId: string) => void;
  onCompleteJob?: (jobId: string) => Promise<void>;
}

function MissionActiveRow({
  m,
  missionDefs,
  onOpenJob,
  onCompleteJob,
}: {
  m: any;
  missionDefs: any[];
  onOpenJob: (id: string) => void;
  onCompleteJob?: (id: string) => Promise<void>;
}) {
  const [completing, setCompleting] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);

  const handleComplete = async () => {
    if (completing || !onCompleteJob) return;
    setCompleting(true);
    setCompleteError(null);
    try {
      await onCompleteJob(m.id);
    } catch (err: any) {
      setCompleteError(err?.message ?? 'Failed to complete mission. Please try again.');
    } finally {
      setCompleting(false);
    }
  };

  return (
    <div className="flex flex-col gap-1">
    <div
      key={m.id}
      onClick={() => onOpenJob(m.id)}
      className="cursor-pointer flex items-center gap-3 px-3 py-2.5 rounded-lg border border-[rgba(139,92,246,0.2)] bg-bg-card hover:border-[rgba(139,92,246,0.45)] transition-colors"
    >
      <span className="flex-1 min-w-0 text-[13px] font-bold text-text-primary truncate">
        {missionDefs.find((d: any) => d.id === m.defId)?.name ?? m.defId ?? 'Unknown Mission'}
      </span>
      <div className="flex-shrink-0 w-36" onClick={(e) => e.stopPropagation()}>
        <JobProgressBar
          startTick={m.startTick}
          durationTicks={m.durationTicks}
          color="#8b5cf6"
          compact
          readyLabel="✅ Ready"
          readyActionLabel={onCompleteJob ? (completing ? '…' : 'Complete') : undefined}
          onAction={onCompleteJob ? handleComplete : undefined}
          actionDisabled={completing}
        />
      </div>
    </div>
    {completeError && (
      <div className="px-2 py-1.5 rounded-md bg-[rgba(239,68,68,0.12)] border border-[rgba(239,68,68,0.35)] text-[#fca5a5] text-[11px] leading-tight">
        ⚠ {completeError}
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
  onCompleteJob,
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
              onCompleteJob={onCompleteJob}
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
      <div className="flex-1 min-h-0 overflow-y-auto touch-pan-y p-3">
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
          <div className="px-3 pb-3 max-h-[35vh] overflow-y-auto touch-pan-y">
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
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold tracking-wide border whitespace-nowrap ${isCompleted ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-red-500/20 text-red-400 border-red-500/30'}`}>
                        {isCompleted ? 'Success' : 'Failed'}
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
