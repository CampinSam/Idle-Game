import DefaultEntityDetail from '../_default/DefaultEntityDetail';
import type { EntityDetailProps } from '../../types';

export default function CyborgEntityDetail(props: EntityDetailProps) {
  if (props.variant === 'lightweight') {
    return <DefaultEntityDetail {...props} />;
  }

  return (
    <div className="entity-detail--cyborg">
      <div className="flex items-center gap-2 px-3 py-1.5 text-[10px] font-extrabold tracking-[1.2px] uppercase text-[#7dd3fc] border-b border-[rgba(56,189,248,0.45)] [background:linear-gradient(90deg,rgba(14,165,233,0.18),rgba(14,165,233,0.04))]">
        <span
          className="w-2 h-2 rounded-full bg-[#22d3ee] shadow-[0_0_8px_rgba(34,211,238,0.85)] [animation:cyborg-detail-blink_1.6s_ease-in-out_infinite] shrink-0"
          aria-hidden
        />
        SYSTEM ONLINE · CYBORG UNIT
      </div>
      <DefaultEntityDetail {...props} />
    </div>
  );
}
