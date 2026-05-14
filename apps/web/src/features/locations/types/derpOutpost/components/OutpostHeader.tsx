import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { getRegionDisplay } from '@derp/shared';
import { useCommand } from '../../../../../hooks/useCommand';
import { useAppDispatch } from '../../../../../store';
import { patchPlayerOptimistic } from '../../../../../store/syncSlice';
import { useSyncPlayer } from '../../../../../hooks/useSyncSelectors';

interface OutpostHeaderProps {
  outpost: any;
}

interface DeactivateConfirmProps {
  name: string;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading: boolean;
}

function DeactivateConfirm({ name, onConfirm, onCancel, isLoading }: DeactivateConfirmProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative z-10 w-full max-w-sm mx-4 mb-6 sm:mb-0 bg-gradient-to-b from-[#1e1850] to-[#151030] border-2 border-[rgba(239,68,68,0.4)] rounded-2xl p-5 flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <span className="text-2xl flex-shrink-0">⚠️</span>
          <div>
            <h3 className="font-cinzel text-base font-black text-text-primary mb-1">Deactivate Outpost?</h3>
            <p className="text-[12px] text-text-secondary leading-relaxed">
              <strong className="text-text-primary">{name}</strong> will be deactivated.
            </p>
          </div>
        </div>
        <div className="bg-[rgba(239,68,68,0.08)] border border-[rgba(239,68,68,0.25)] rounded-xl p-3 flex flex-col gap-1.5">
          <div className="text-[11px] font-bold text-[#f87171] tracking-[0.3px] mb-0.5">THIS WILL IMMEDIATELY:</div>
          <div className="flex items-center gap-2 text-[11px] text-text-secondary">
            <span className="text-[#f87171]">•</span>
            Unassign all workers from this outpost
          </div>
          <div className="flex items-center gap-2 text-[11px] text-text-secondary">
            <span className="text-[#f87171]">•</span>
            Cancel all active jobs for every team member
          </div>
          <div className="flex items-center gap-2 text-[11px] text-text-secondary">
            <span className="text-[#f87171]">•</span>
            Archive related notifications
          </div>
        </div>
        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="flex-1 py-2.5 rounded-xl border border-border text-text-secondary text-[12px] font-bold tracking-[0.3px] bg-transparent hover:border-[rgba(139,92,246,0.4)] hover:text-text-primary transition-colors cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className="flex-1 py-2.5 rounded-xl border border-[rgba(239,68,68,0.5)] text-[#f87171] text-[12px] font-bold tracking-[0.3px] bg-[rgba(239,68,68,0.12)] hover:bg-[rgba(239,68,68,0.2)] transition-colors cursor-pointer disabled:opacity-50"
          >
            {isLoading ? 'Deactivating…' : 'Deactivate'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function OutpostHeader({ outpost }: OutpostHeaderProps) {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { execute } = useCommand();
  const player = useSyncPlayer();

  const [showDeactivate, setShowDeactivate] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [settingPrimary, setSettingPrimary] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);

  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const id = outpost.id;
  const regionDisplay = getRegionDisplay(outpost.regionId || outpost.region);
  const regionName = regionDisplay.displayName;

  const isPrimary = player?.primaryLocationId === id;
  const isActive = outpost.enabled !== false;

  useEffect(() => {
    if (!menuOpen) return;
    function handleOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        menuRef.current &&
        !menuRef.current.contains(e.target as Node)
      ) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [menuOpen]);

  const toggleMenu = () => {
    if (!menuOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setMenuPos({ top: rect.bottom + 6, right: window.innerWidth - rect.right });
    }
    setMenuOpen((o) => !o);
  };

  const handleSetPrimary = async () => {
    const previous = player?.primaryLocationId ?? null;
    setMenuOpen(false);
    setSettingPrimary(true);
    dispatch(patchPlayerOptimistic({ primaryLocationId: id }));
    try {
      await execute('SetPrimaryOutpost', { locationId: id });
    } catch (err) {
      dispatch(patchPlayerOptimistic({ primaryLocationId: previous }));
      console.error('[OutpostHeader] SetPrimaryOutpost failed:', err);
    } finally {
      setSettingPrimary(false);
    }
  };

  const handleDeactivateRequest = () => {
    setMenuOpen(false);
    setShowDeactivate(true);
  };

  const handleActivate = async () => {
    setMenuOpen(false);
    try {
      await execute('ToggleLocation', { locationId: id, enabled: true });
    } catch (err) {
      console.error('[OutpostHeader] ToggleLocation activate failed:', err);
    }
  };

  const handleDeactivateConfirm = async () => {
    setDeactivating(true);
    try {
      await execute('ToggleLocation', { locationId: id, enabled: false });
      setShowDeactivate(false);
    } catch (err) {
      console.error('[OutpostHeader] ToggleLocation deactivate failed:', err);
    } finally {
      setDeactivating(false);
    }
  };

  return (
    <>
      <div className="bg-[rgba(26,22,64,0.97)] border-b border-[rgba(139,92,246,0.12)] sticky top-0 z-10">
        <div className="flex items-center gap-2 px-3 py-2">
          <button
            type="button"
            className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-white/5 border border-[rgba(139,92,246,0.25)] text-text-primary text-xl cursor-pointer transition-colors flex-shrink-0 active:bg-[rgba(139,92,246,0.28)] active:border-[rgba(139,92,246,0.55)]"
            onClick={() => navigate('/locations')}
            aria-label="Back to locations"
          >
            ←
          </button>

          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-bold tracking-wide text-text-primary truncate m-0">
              {(outpost.name || 'Outpost').toUpperCase()}
            </h1>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              <span className="text-xs text-text-secondary truncate">{regionName}</span>
              {isPrimary && (
                <span className="text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded bg-[rgba(167,139,250,0.15)] border border-[rgba(167,139,250,0.4)] text-[#a78bfa] flex-shrink-0">
                  ★ Primary
                </span>
              )}
              {isActive ? (
                <span className="text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded bg-[rgba(34,197,94,0.12)] border border-[rgba(34,197,94,0.35)] text-[#4ade80] flex-shrink-0">
                  Active
                </span>
              ) : (
                <span className="text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded bg-white/5 border border-white/20 text-text-secondary flex-shrink-0">
                  Inactive
                </span>
              )}
            </div>
          </div>

          <div className="relative flex-shrink-0" ref={menuRef}>
            <button
              ref={buttonRef}
              type="button"
              className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-white/5 border border-[rgba(139,92,246,0.25)] text-base cursor-pointer transition-colors"
              onClick={toggleMenu}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              ⚙️
            </button>
          </div>

          {menuOpen && menuPos && createPortal(
            <div
              ref={dropdownRef}
              className="fixed z-[9999] bg-[#1a1640] border border-[rgba(139,92,246,0.3)] rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.5)] p-1 min-w-[160px]"
              style={{ top: menuPos.top, right: menuPos.right }}
              role="menu"
            >
              {isActive && !isPrimary && (
                <button
                  type="button"
                  disabled={settingPrimary}
                  className="flex items-center gap-2 w-full px-3.5 py-2.5 bg-transparent border-0 text-text-primary text-[13px] font-[inherit] text-left cursor-pointer rounded-md transition-[background] duration-150 whitespace-nowrap hover:bg-[rgba(139,92,246,0.18)] focus-visible:bg-[rgba(139,92,246,0.18)] focus-visible:outline-none disabled:opacity-50"
                  role="menuitem"
                  onClick={handleSetPrimary}
                >
                  {settingPrimary ? '⏳ Setting…' : '★ Set as Primary'}
                </button>
              )}
              {isActive ? (
                <button
                  type="button"
                  className="flex items-center gap-2 w-full px-3.5 py-2.5 bg-transparent border-0 text-[#f87171] text-[13px] font-[inherit] text-left cursor-pointer rounded-md transition-[background] duration-150 whitespace-nowrap hover:bg-[rgba(239,68,68,0.12)] focus-visible:bg-[rgba(239,68,68,0.12)] focus-visible:outline-none"
                  role="menuitem"
                  onClick={handleDeactivateRequest}
                >
                  ⏸ Deactivate
                </button>
              ) : (
                <button
                  type="button"
                  className="flex items-center gap-2 w-full px-3.5 py-2.5 bg-transparent border-0 text-[#4ade80] text-[13px] font-[inherit] text-left cursor-pointer rounded-md transition-[background] duration-150 whitespace-nowrap hover:bg-[rgba(34,197,94,0.12)] focus-visible:bg-[rgba(34,197,94,0.12)] focus-visible:outline-none"
                  role="menuitem"
                  onClick={handleActivate}
                >
                  ▶ Activate
                </button>
              )}
            </div>,
            document.body,
          )}
        </div>
      </div>

      {showDeactivate && (
        <DeactivateConfirm
          name={outpost.name || regionName}
          onConfirm={handleDeactivateConfirm}
          onCancel={() => setShowDeactivate(false)}
          isLoading={deactivating}
        />
      )}
    </>
  );
}
