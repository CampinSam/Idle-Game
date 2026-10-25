import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import type { ModalSpecV1, ModalButton as ModalButtonSpec, ModalAction, ModalSkipCost } from '@derp/shared';
import { computeEffectivePage } from '@derp/shared';
import BlockRenderer from './blocks/BlockRenderer';
import AssetImage from './AssetImage';
import ItemQty from '../ItemQty';
import QuantityPickerContext from '../../context/QuantityPickerContext';
import { useNow } from '../../hooks/useNow';
import { useAppSelector } from '../../store';

export interface GameModalProps {
  spec: ModalSpecV1;
  interactionBlocked?: boolean;
  missionSurface?: boolean;
  refreshError?: string | null;
  onRetryRefresh?: () => void;
  isOpen: boolean;
  onRequestClose: () => void;
  navigate: (route: string, params?: Record<string, unknown>) => void;
  onAction: (action: ModalAction) => Promise<void>;
}

export default function GameModal({ spec, interactionBlocked = false, missionSurface = false, refreshError, onRetryRefresh, isOpen, onRequestClose, navigate, onAction }: GameModalProps) {
  const [pageIndex, setPageIndex] = useState(0);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [pendingConfirmBtn, setPendingConfirmBtn] = useState<ModalButtonSpec | null>(null);
  const [pickerValues, setPickerValues] = useState<Record<string, number>>({});

  const dialogRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const confirmationRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isOpen) setPendingConfirmBtn(null);
  }, [isOpen]);
  useEffect(() => {
    if (!isOpen || !pendingConfirmBtn) return;
    const content = contentRef.current;
    const confirmation = confirmationRef.current;
    const dialog = dialogRef.current;
    if (!content || !confirmation) return;
    const previous = document.activeElement as HTMLElement | null;
    content.setAttribute('inert', '');
    const controls = () => Array.from(confirmation.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]'));
    (controls()[0] ?? confirmation).focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      // Stop the enclosing mission-dialog trap from including its own controls.
      event.stopPropagation();
      const items = controls();
      const first = items[0]; const last = items[items.length - 1];
      if (!first) { event.preventDefault(); confirmation.focus(); return; }
      if (!confirmation.contains(document.activeElement) || document.activeElement === confirmation) {
        event.preventDefault(); (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener('keydown', trap, true);
    return () => {
      document.removeEventListener('keydown', trap, true);
      content.removeAttribute('inert');
      if (previous?.isConnected && !previous.matches(':disabled')) previous.focus();
      else dialog?.focus();
    };
  }, [isOpen, pendingConfirmBtn]);
  useEffect(() => {
    if (!isOpen || !missionSurface) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    dialog?.focus();
    const keepFocus = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !dialog) return;
      const controls = Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]'));
      if (!controls.length) { event.preventDefault(); dialog.focus(); return; }
      const first = controls[0]; const last = controls[controls.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog)) { event.preventDefault(); first.focus(); }
    };
    dialog?.addEventListener('keydown', keepFocus);
    return () => { dialog?.removeEventListener('keydown', keepFocus); if (previous?.isConnected) previous.focus();
      else { const surface = document.querySelector<HTMLElement>('.mission-surface'); surface?.setAttribute('tabindex', '-1'); surface?.focus(); } };
  }, [isOpen, missionSurface]);

  useEffect(() => {
    if (isOpen && missionSurface) {
      if (!dialogRef.current?.contains(document.activeElement)) dialogRef.current?.focus();
      if (dialogRef.current) {
        dialogRef.current.scrollTop = 0;
        const body = dialogRef.current.querySelector<HTMLElement>('.gm-body');
        if (body) body.scrollTop = 0;
      }
    }
  }, [isOpen, missionSurface, spec.id]);

  const now = useNow(500);
  const currencyBalances = useAppSelector((s) => s.sync.currencyBalances);

  useEffect(() => {
    setActionError(null);
    setPageIndex(0);
    setPendingConfirmBtn(null);
    const initial: Record<string, number> = {};
    for (const page of spec.pages ?? []) {
      for (const block of page.body ?? []) {
        if (block.type === 'quantityInput') {
          initial[block.id] = block.defaultValue;
        }
      }
    }
    setPickerValues(initial);
  }, [spec]);

  const setPickerValue = useCallback((id: string, value: number) => {
    setPickerValues((prev) => ({ ...prev, [id]: value }));
  }, []);

  const pickerCtx = useMemo(
    () => ({ values: pickerValues, setValue: setPickerValue }),
    [pickerValues, setPickerValue],
  );

  const totalPages = Array.isArray(spec.pages) ? spec.pages.length : 0;
  const { header, body, buttons, dismiss } = computeEffectivePage(spec, pageIndex);

  const progressBlock = useMemo(() => {
    for (const page of spec.pages ?? []) {
      for (const block of page.body ?? []) {
        if (block.type === 'progress' && block.startsAt && block.endsAt) {
          return block;
        }
      }
    }
    return null;
  }, [spec]);

  const computeCurrentSkipCosts = useCallback(
    (baseCosts: ModalSkipCost[], skipType: 'absolute' | 'scaling'): ModalSkipCost[] => {
      if (skipType === 'absolute' || !progressBlock?.startsAt || !progressBlock?.endsAt) {
        return baseCosts;
      }
      const totalDuration = Date.parse(progressBlock.endsAt) - Date.parse(progressBlock.startsAt);
      const remaining = Math.max(0, Date.parse(progressBlock.endsAt) - now);
      const multiplier = totalDuration > 0 ? remaining / totalDuration : 0;
      return baseCosts.map((c) => ({
        ...c,
        amount: multiplier < 1 ? Math.max(1, Math.ceil(c.amount * multiplier)) : c.amount,
      }));
    },
    [progressBlock, now],
  );

  const isSkipAffordable = useCallback(
    (costs: ModalSkipCost[]): boolean =>
      costs.every((c) => {
        if (!c.currencyId) return true;
        return (currencyBalances[c.currencyId] ?? 0) >= c.amount;
      }),
    [currencyBalances],
  );

  useEffect(() => {
    if (!isOpen || (!dismiss.escape && !pendingConfirmBtn)) return;
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


  const onBackdropClick = () => {
    if (pendingConfirmBtn) {
      setPendingConfirmBtn(null);
      return;
    }
    if (dismiss.backdrop) onRequestClose();
  };

  const resolveAction = useCallback((action: ModalAction): ModalAction => {
    if (action.type === 'DEPOSIT_LOCATION_XP' && action.chargesBindingId) {
      const qty = pickerValues[action.chargesBindingId] ?? action.charges ?? 1;
      return { ...action, charges: Math.max(1, Math.floor(qty)) };
    }
    return action;
  }, [pickerValues]);

  const fireAction = async (btn: ModalButtonSpec) => {
    if (interactionBlocked || actionLoading || btn.disabled) return;
    setActionError(null);
    setActionLoading(btn.id);
    try {
      await onAction(resolveAction(btn.action));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Action failed. Please try again.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleButtonClick = async (btn: ModalButtonSpec) => {
    if (btn.disabled || interactionBlocked || actionLoading) return;

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

  if (!isOpen) return null;

  return (
    <QuantityPickerContext.Provider value={pickerCtx}>
    <div className={`gm-overlay ${missionSurface ? 'mission-dialog' : ''}`} onMouseDown={onBackdropClick} role="presentation">
      <div ref={dialogRef} tabIndex={-1} className="gm-modal" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={header.title}>
        <div ref={contentRef} style={{ display: 'contents' }} aria-hidden={pendingConfirmBtn ? true : undefined}>
        {refreshError && <div role="alert" className="p-3 text-sm text-red-300">{refreshError}{onRetryRefresh && <button onClick={onRetryRefresh}>Retry</button>}</div>}
        {actionError && <p role="alert" className="p-3 text-sm text-red-300">{actionError}</p>}
        {interactionBlocked && <p role="status" className="px-3 text-xs">Updating mission…</p>}
        <>
            {header.banner ? (
              <div className="gm-banner">
                <AssetImage asset={header.banner} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', maxWidth: 'none', maxHeight: 'none' }} />
                <div className="gm-banner-title-overlay">
                  <h2 className="gm-title">{header.title}</h2>
                  {header.subtitle && <p className="gm-subtitle">{header.subtitle}</p>}
                </div>
              </div>
            ) : (
              <div className="gm-header">
                {header.icon && (
                  <div className="gm-header-icon">
                    <AssetImage asset={header.icon} style={{ width: 48, height: 48, borderRadius: 12 }} />
                  </div>
                )}
                <h2 className="gm-title">{header.title}</h2>
                {header.subtitle && <p className="gm-subtitle">{header.subtitle}</p>}
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

            <div className="gm-body">
              {body.map((block, idx) => (
                <BlockRenderer key={`${spec.id}_p${pageIndex}_b_${idx}`} block={block} />
              ))}
            </div>

            <div className="gm-footer">
              {buttons.map((btn) => {
                const currentCosts = btn.skipMeta
                  ? computeCurrentSkipCosts(btn.skipMeta.baseCosts, btn.skipMeta.skipType)
                  : null;
                const skipDisabled = currentCosts ? !isSkipAffordable(currentCosts) : false;
                const isDisabled = interactionBlocked || btn.disabled || skipDisabled || actionLoading !== null;

                return (
                  <button
                    key={btn.id}
                    className={`gm-btn gm-btn-${btn.variant}`}
                    disabled={isDisabled}
                    onClick={() => handleButtonClick(btn)}
                  >
                    {actionLoading === btn.id ? (
                      '...'
                    ) : (
                      <span className="flex items-center justify-center gap-2">
                        <span>{btn.label}</span>
                        {currentCosts && currentCosts.length > 0 && (
                          <span className="flex items-center gap-1">
                            {currentCosts.map((c, i) => (
                              <ItemQty key={i} src={c.assetKey ?? c.label} amount={c.amount} size={13} />
                            ))}
                          </span>
                        )}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
        </>
        </div>

        {pendingConfirmBtn && (
          <div
            ref={confirmationRef}
            role="alertdialog"
            aria-modal="true"
            aria-label={pendingConfirmBtn.requiresConfirm!.title}
            tabIndex={-1}
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
                disabled={interactionBlocked || actionLoading !== null}
                onClick={handleConfirm}
              >
                {actionLoading === pendingConfirmBtn.id ? '...' : (pendingConfirmBtn.requiresConfirm!.confirmLabel ?? 'Confirm')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
    </QuantityPickerContext.Provider>
  );
}
