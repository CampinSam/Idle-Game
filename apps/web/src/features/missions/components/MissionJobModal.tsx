import { useEffect } from 'react';
import { useMissionJob } from '../../../context/MissionJobContext';
import { MissionPanel } from './MissionPanel';

export function MissionJobModal() {
  const { activeJobId, closeMissionJob } = useMissionJob();

  useEffect(() => {
    if (!activeJobId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMissionJob();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [activeJobId, closeMissionJob]);

  if (!activeJobId) return null;

  return (
    <div
      className="fixed inset-0 z-[300] flex flex-col justify-end"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={closeMissionJob}
      />
      <div
        className="relative z-10 w-full max-w-[600px] mx-auto flex flex-col"
        style={{ maxHeight: '92dvh' }}
      >
        <div className="w-12 h-1 rounded-full bg-white/20 mx-auto mb-2 flex-shrink-0" />
        <div
          className="flex flex-col min-h-0 overflow-hidden rounded-t-2xl"
          style={{ maxHeight: 'calc(92dvh - 20px)' }}
        >
          <MissionPanel
            mode="in_progress"
            jobId={activeJobId}
            onClose={closeMissionJob}
            onBack={closeMissionJob}
          />
        </div>
      </div>
    </div>
  );
}
