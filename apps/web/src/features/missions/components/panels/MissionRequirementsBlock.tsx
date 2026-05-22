import { useSurfaceContext } from '../../../content-document/SurfaceContext';

const PANEL_CLASS = 'rounded-xl border border-[rgba(139,92,246,0.18)] bg-black/20 p-3 flex flex-col gap-2';
const PANEL_TITLE_CLASS = 'text-[11px] font-extrabold tracking-[0.08em] uppercase text-[#c4b5fd]';

/**
 * Standalone requirements panel that reads from SurfaceContext data.
 * Registered as the `mission_requirements` content block type.
 * MissionPanel continues to render its own inline version until Task #722.
 */
export function MissionRequirementsBlock() {
  const { data } = useSurfaceContext();
  const requirements: Array<{ label?: string; met: boolean }> = data.previewRequirements ?? [];
  const loading: boolean = data.previewLoading ?? false;

  return (
    <div className={PANEL_CLASS}>
      <div className={PANEL_TITLE_CLASS}>Requirements</div>
      {loading && requirements.length === 0 ? (
        <div className="flex flex-col gap-1.5">
          <div className="h-3.5 rounded bg-white/[0.06] animate-pulse w-4/5" />
          <div className="h-3.5 rounded bg-white/[0.06] animate-pulse w-3/5" />
        </div>
      ) : requirements.length === 0 ? (
        <span className="text-[12px] text-text-secondary italic">No requirements</span>
      ) : (
        <div className="flex flex-col gap-1.5">
          {requirements.map((r, i) => (
            <div key={i} className="flex items-center gap-2 text-[12px]">
              <span className="text-base leading-none flex-shrink-0">{r.met ? '✅' : '❌'}</span>
              <span
                className="flex-1 font-medium truncate"
                style={{ color: r.met ? '#10b981' : '#ef4444' }}
              >
                {r.label ?? 'Requirement'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
