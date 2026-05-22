import { useEffect, useState } from 'react';
import type { ModalSpecV1, ModalButton as ModalButtonSpec, ModalAction } from '@derp/shared';
import { computeEffectivePage } from '@derp/shared';
import BlockRenderer from './blocks/BlockRenderer';
import AssetImage from './AssetImage';
import { MissionPanel } from '../../features/missions/components/MissionPanel';

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
  const [pendingConfirmBtn, setPendingConfirmBtn] = useState<ModalButtonSpec | null>(null);

  useEffect(() => {
    setPageIndex(0);
    setPendingConfirmBtn(null);
  }, [spec]);

  const totalPages = Array.isArray(spec.pages) ? spec.pages.length : 0;
  const { header, body, buttons, dismiss } = computeEffectivePage(spec, pageIndex);
  const currentPageRaw = Array.isArray(spec.pages) ? spec.pages[Math.max(0, Math.min(pageIndex, totalPages - 1))] : null;
  const isMissionPanel = currentPageRaw?.type === 'missionPanel';

  useEffect(() => {
    if (!isOpen || !dismiss.escape) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (pendingConfirmBtn) {
          setPendingConfirmBtn(null);
        } else {
          onRequestClose();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, dismiss.escape, onRequestClose, pendingConfirmBtn]);

  if (!isOpen) return null;

  const onBackdropClick = () => {
    if (pendingConfirmBtn) {
      setPendingConfirmBtn(null);
      return;
    }
    if (dismiss.backdrop) onRequestClose();
  };

  const fireAction = async (btn: ModalButtonSpec) => {
    setActionLoading(btn.id);
    try {
      await onAction(btn.action);
    } catch (err) {
      console.error('[GameModal] action failed:', err);
    } finally {
      setActionLoading(null);
    }
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
      setPendingConfirmBtn(btn);
      return;
    }

    await fireAction(btn);
  };

  const handleConfirm = async () => {
    if (!pendingConfirmBtn) return;
    const btn = pendingConfirmBtn;
    setPendingConfirmBtn(null);
    await fireAction(btn);
  };

  const handleCancelConfirm = () => setPendingConfirmBtn(null);

  return (
    <div className="gm-overlay" onMouseDown={onBackdropClick} role="presentation">
      <div className="gm-modal" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        {isMissionPanel && currentPageRaw?.missionPanel ? (
          <>
            {dismiss.x && (
              <button className="gm-close-btn" onClick={onRequestClose} aria-label="Close">✕</button>
            )}
            {spec.showPageIndicator && totalPages > 1 && (
              <div className="gm-page-indicator" aria-label={`Page ${pageIndex + 1} of ${totalPages}`}>
                {pageIndex + 1} / {totalPages}
              </div>
            )}
            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: '12px' }}>
              <MissionPanel
                mode={currentPageRaw.missionPanel.mode}
                defId={currentPageRaw.missionPanel.defId}
                jobId={currentPageRaw.missionPanel.jobId}
                onClose={onRequestClose}
                onBack={totalPages > 1 ? () => setPageIndex(i => Math.max(i - 1, 0)) : onRequestClose}
                onMissionStarted={onRequestClose}
              />
            </div>
          </>
        ) : (
          <>
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
          </>
        )}

        {pendingConfirmBtn && (
          <div
            className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 p-6"
            style={{ background: 'linear-gradient(180deg, rgba(20,10,40,0.97) 0%, rgba(10,5,25,0.97) 100%)' }}
          >
            <p className="text-center font-semibold text-base" style={{ color: 'var(--text-primary)' }}>
              {pendingConfirmBtn.requiresConfirm!.title}
            </p>

            {pendingConfirmBtn.requiresConfirm!.body && pendingConfirmBtn.requiresConfirm!.body.length > 0 && (
              <div className="w-full">
                {pendingConfirmBtn.requiresConfirm!.body.map((block, idx) => (
                  <BlockRenderer key={idx} block={block} />
                ))}
              </div>
            )}

            <div className="flex gap-3 w-full mt-1">
              <button className="gm-btn gm-btn-ghost flex-1" onClick={handleCancelConfirm}>
                {pendingConfirmBtn.requiresConfirm!.cancelLabel ?? 'Cancel'}
              </button>
              <button
                className="gm-btn gm-btn-primary flex-1"
                disabled={actionLoading === pendingConfirmBtn.id}
                onClick={handleConfirm}
              >
                {actionLoading === pendingConfirmBtn.id ? '...' : (pendingConfirmBtn.requiresConfirm!.confirmLabel ?? 'Confirm')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
