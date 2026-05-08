import { useEffect, useState } from 'react';
import type { ModalSpecV1, ModalButton as ModalButtonSpec, ModalAction } from '@derp/shared';
import BlockRenderer from './blocks/BlockRenderer';
import AssetImage from './AssetImage';

export interface GameModalProps {
  spec: ModalSpecV1;
  isOpen: boolean;
  onRequestClose: () => void;
  navigate: (route: string, params?: Record<string, unknown>) => void;
  onAction: (action: ModalAction) => Promise<void>;
}

export default function GameModal({ spec, isOpen, onRequestClose, navigate, onAction }: GameModalProps) {
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !spec.dismiss.escape) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onRequestClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, spec.dismiss.escape, onRequestClose]);

  if (!isOpen) return null;

  const onBackdropClick = () => {
    if (spec.dismiss.backdrop) onRequestClose();
  };

  const handleButtonClick = async (btn: ModalButtonSpec) => {
    if (btn.disabled) return;

    if (btn.requiresConfirm) {
      const confirmed = window.confirm(btn.requiresConfirm.title);
      if (!confirmed) return;
    }

    setActionLoading(btn.id);
    try {
      await onAction(btn.action);
    } catch (err) {
      console.error('[GameModal] action failed:', err);
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="gm-overlay" onMouseDown={onBackdropClick} role="presentation">
      <div className="gm-modal" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        {spec.header.banner && (
          <div className="gm-banner">
            <AssetImage asset={spec.header.banner} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        )}

        {spec.dismiss.x && (
          <button className="gm-close-btn" onClick={onRequestClose} aria-label="Close">✕</button>
        )}

        <div className="gm-header">
          {spec.header.icon && (
            <div className="gm-header-icon">
              <AssetImage asset={spec.header.icon} style={{ width: 48, height: 48, borderRadius: 12 }} />
            </div>
          )}
          <h2 className="gm-title">{spec.header.title}</h2>
          {spec.header.subtitle && <p className="gm-subtitle">{spec.header.subtitle}</p>}
        </div>

        <div className="gm-body">
          {spec.body.map((block, idx) => (
            <BlockRenderer key={`${spec.id}_b_${idx}`} block={block} />
          ))}
        </div>

        <div className="gm-footer">
          {spec.buttons.map((btn) => (
            <button
              key={btn.id}
              className={`gm-btn gm-btn-${btn.variant}`}
              disabled={btn.disabled || actionLoading === btn.id}
              onClick={() => handleButtonClick(btn)}
            >
              {actionLoading === btn.id ? '...' : btn.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
