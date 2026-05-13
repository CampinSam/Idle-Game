import { useEffect, useState } from 'react';
import type { ModalSpecV1, ModalButton as ModalButtonSpec, ModalAction } from '@derp/shared';
import { computeEffectivePage } from '@derp/shared';
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
  const [pageIndex, setPageIndex] = useState(0);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    setPageIndex(0);
  }, [spec.id]);

  const totalPages = spec.pages.length;
  const { header, body, buttons, dismiss } = computeEffectivePage(spec, pageIndex);

  useEffect(() => {
    if (!isOpen || !dismiss.escape) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onRequestClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, dismiss.escape, onRequestClose]);

  if (!isOpen) return null;

  const onBackdropClick = () => {
    if (dismiss.backdrop) onRequestClose();
  };

  const handleButtonClick = async (btn: ModalButtonSpec) => {
    if (btn.disabled) return;

    if (btn.action.type === 'NEXT_PAGE') {
      setPageIndex(i => Math.min(i + 1, totalPages - 1));
      return;
    }

    if (btn.action.type === 'PREV_PAGE') {
      setPageIndex(i => Math.max(i - 1, 0));
      return;
    }

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
        {header.banner && (
          <div className="gm-banner">
            <AssetImage asset={header.banner} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        )}

        {dismiss.x && (
          <button className="gm-close-btn" onClick={onRequestClose} aria-label="Close">✕</button>
        )}

        {spec.showPageIndicator && totalPages > 1 && (
          <div className="gm-page-indicator" aria-label={`Page ${pageIndex + 1} of ${totalPages}`}>
            {pageIndex + 1} / {totalPages}
          </div>
        )}

        <div className="gm-header">
          {header.icon && (
            <div className="gm-header-icon">
              <AssetImage asset={header.icon} style={{ width: 48, height: 48, borderRadius: 12 }} />
            </div>
          )}
          <h2 className="gm-title">{header.title}</h2>
          {header.subtitle && <p className="gm-subtitle">{header.subtitle}</p>}
        </div>

        <div className="gm-body">
          {body.map((block, idx) => (
            <BlockRenderer key={`${spec.id}_p${pageIndex}_b_${idx}`} block={block} />
          ))}
        </div>

        <div className="gm-footer">
          {buttons.map((btn) => (
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
