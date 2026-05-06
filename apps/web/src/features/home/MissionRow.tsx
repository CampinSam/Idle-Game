import React from 'react';
import './HomePage.css';

/**
 * Shared mission row used by `HomePage`. Wraps
 * the existing `hp-mission-*` markup so both screens stay visually
 * consistent and any future tweak only happens in one place.
 */

interface ReadyRowProps {
  name: string;
  showClaim?: boolean;
  claiming?: boolean;
  onClick?: () => void;
  onClaim?: () => void;
}

export function MissionReadyRow({ name, showClaim, claiming, onClick, onClaim }: ReadyRowProps) {
  return (
    <div
      className="hp-mission-row hp-mission-ready"
      onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : undefined }}
    >
      <div className="hp-mission-icon hp-mission-icon-done">✅</div>
      <div className="hp-mission-info">
        <span className="hp-mission-name">{name}</span>
        <span className="hp-mission-status-text">Ready to claim!</span>
      </div>
      {showClaim && (
        <button
          className="hp-claim-btn"
          onClick={(e) => { e.stopPropagation(); onClaim?.(); }}
          disabled={claiming}
        >
          {claiming ? '...' : 'CLAIM'}
        </button>
      )}
    </div>
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
    <div
      className="hp-mission-row"
      onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : undefined }}
    >
      <div className="hp-mission-icon">{icon ?? '🗺️'}</div>
      <div className="hp-mission-info">
        <span className="hp-mission-name">{name}</span>
        {subtitle && <span className="hp-mission-status-text">{subtitle}</span>}
      </div>
      {timeLabel != null && (
        <div className="hp-mission-timer">
          <span className="hp-timer-badge">{timeLabel}</span>
        </div>
      )}
    </div>
  );
}
