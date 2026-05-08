import React from 'react';
import { Row } from '../../components/ui';

/**
 * Shared mission row used by `HomePage`. Built on the shared `<Row>`
 * primitive so both the ready and in-progress variants stay visually
 * consistent and any future tweak only happens in one place.
 */

interface ReadyRowProps {
  name: string;
  showClaim?: boolean;
  claiming?: boolean;
  onClick?: () => void;
  onClaim?: () => void;
}

const ICON_BASE =
  'flex items-center justify-center w-[34px] h-[34px] rounded-lg text-[22px] flex-shrink-0';

export function MissionReadyRow({ name, showClaim, claiming, onClick, onClaim }: ReadyRowProps) {
  return (
    <Row
      onClick={onClick}
      highlight
      leading={<div className={`${ICON_BASE} bg-[rgba(16,185,129,0.2)]`}>✅</div>}
      title={name}
      subtitle={<span className="text-[#6ee7b7] font-semibold">Ready to claim!</span>}
      trailing={
        showClaim ? (
          <button
            data-sfx="ui.button_primary"
            className="bg-gradient-to-br from-[#16a34a] to-[#15803d] text-white border-0 rounded-lg px-3.5 py-1.5 text-xs font-extrabold tracking-wide cursor-pointer transition-all hover:-translate-y-px hover:shadow-[0_4px_12px_rgba(22,163,74,0.4)] disabled:opacity-50"
            onClick={(e) => {
              e.stopPropagation();
              onClaim?.();
            }}
            disabled={claiming}
          >
            {claiming ? '...' : 'CLAIM'}
          </button>
        ) : undefined
      }
    />
  );
}

interface InProgressRowProps {
  name: string;
  icon?: React.ReactNode;
  subtitle?: string;
  timeLabel?: string | null;
  onClick?: () => void;
}

export function MissionInProgressRow({ name, icon, subtitle, timeLabel, onClick }: InProgressRowProps) {
  return (
    <Row
      onClick={onClick}
      leading={<div className={`${ICON_BASE} bg-[rgba(139,92,246,0.15)]`}>{icon ?? '🗺️'}</div>}
      title={name}
      subtitle={subtitle ? <span className="text-[#6ee7b7] font-semibold">{subtitle}</span> : undefined}
      trailing={
        timeLabel != null ? (
          <span className="inline-block bg-gradient-to-br from-[#065f46] to-[#047857] text-[#6ee7b7] px-2.5 py-1 rounded-md text-xs font-bold whitespace-nowrap">
            {timeLabel}
          </span>
        ) : undefined
      }
    />
  );
}
