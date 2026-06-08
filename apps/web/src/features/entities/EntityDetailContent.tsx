import { useState, useCallback, useEffect, useRef, useMemo, useSyncExternalStore, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { FullscreenModal } from '../../components/ui';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAppSelector } from '../../store';
import { EntityDetail } from './components';
import { getFilteredSortedEntities, normalizeFilter } from './entityListUtils';
import { getEntityKind } from './registry';
import { isNftEntity } from './types/derp_bird/isNftEntity';
import { isPerfectSpecimen, getPerfectSpecimenTrait } from './types/derp_bird/isPerfectSpecimen';
import { isLeader } from './types/perp/isLeader';
import { getFaction } from './types/perp/getFaction';
import { useCommand } from '../../hooks/useCommand';
import { useBodyCardVariant } from '../../context/BodyCardVariantContext';
import type { EntityFilter, EntitySortBy } from './types';

const PERP_FACTION_LABELS: Record<string, string> = {
  genovault: 'GENOVAULT',
  astro_schism: 'ASTRO SCHISM',
  kraashers: 'KRAASHERS',
};

function getCollectionLabel(entity: any): string | null {
  const kind = getEntityKind(entity);
  if (kind === 'derp_bird') return 'Derp Bird Collection';
  if (kind === 'perp') return 'Perp Collection';
  return null;
}

function buildNftExplorerUrl(nftAssetId: string): string | null {
  const parts = nftAssetId.split(':');
  if (parts.length < 3) return null;
  const [chain, policyId, assetId] = parts;
  if (chain === 'CARDANO') {
    return `https://pool.pm/${policyId}.${assetId}`;
  }
  return null;
}

const STORAGE_KEY_FILTER = 'entities_activeFilter';
const STORAGE_KEY_SORT   = 'entities_sortBy';
const STORAGE_KEY_SEARCH = 'entities_searchQuery';
const MAX_NAME_LENGTH = 32;

type SlideDir = 'left' | 'right';
type LocationState = { slideDir?: SlideDir };

function safeGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

function readBrowseSort(): EntitySortBy {
  const v = safeGet(STORAGE_KEY_SORT);
  if (v === 'name' || v === 'level' || v === 'power' || v === 'collection') return v;
  return 'name';
}

function statusEmoji(status: string | undefined): string {
  switch ((status || 'idle').toLowerCase()) {
    case 'idle':    return '🟢';
    case 'mission': return '🔵';
    case 'working': return '🟡';
    case 'injured': return '🔴';
    default:        return '⚪';
  }
}

export default function EntityDetailContent() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);
  const [renameLoading, setRenameLoading] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const navigatingRef = useRef(false);
  const pointerRef = useRef<{
    startX: number;
    startY: number;
    axisLocked: boolean;
    pointerId: number;
    cardEl: HTMLDivElement;
  } | null>(null);

  const { execute } = useCommand();
  const { setVariantClass, clearVariantClass } = useBodyCardVariant();

  const prefersReducedMotion = useSyncExternalStore(
    (cb) => {
      if (typeof window === 'undefined') return () => {};
      const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
      mql.addEventListener('change', cb);
      return () => mql.removeEventListener('change', cb);
    },
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    () => false,
  );

  const entity = useAppSelector((s) => s.sync.entities[id ?? '']);
  const entityMap = useAppSelector((s) => s.sync.entities);

  const browseSortBy = useMemo(readBrowseSort, []);
  const browseSearch = useMemo(() => safeGet(STORAGE_KEY_SEARCH) ?? '', []);

  const allEntities = useMemo(() => Object.values(entityMap), [entityMap]);

  const browseFilter = useMemo(
    () => normalizeFilter(safeGet(STORAGE_KEY_FILTER), allEntities),
    [allEntities],
  );

  const navList = useMemo(
    () => getFilteredSortedEntities(allEntities, browseFilter, browseSearch, browseSortBy),
    [allEntities, browseFilter, browseSearch, browseSortBy],
  );

  const currentIdx = navList.findIndex((e) => e.id === id);
  const total = navList.length;
  const hasNav = total > 1 && currentIdx >= 0;
  const prevId: string | undefined = hasNav ? navList[(currentIdx - 1 + total) % total]?.id : undefined;
  const nextId: string | undefined = hasNav ? navList[(currentIdx + 1) % total]?.id : undefined;

  const entityKind = entity ? getEntityKind(entity) : null;
  const entityIsPerf = entity ? isPerfectSpecimen(entity) : false;
  const cardVariantClass = entityKind === 'derp_bird'
    ? (entityIsPerf ? 'edp-card-perfect' : 'edp-card-derp-bird')
    : '';

  useLayoutEffect(() => {
    if (cardVariantClass) {
      setVariantClass(cardVariantClass);
    } else {
      clearVariantClass();
    }
    return () => {
      clearVariantClass();
    };
  }, [cardVariantClass, setVariantClass, clearVariantClass]);

  function springBack(card: HTMLDivElement) {
    card.style.transition = 'transform 0.2s ease-out';
    card.style.transform = 'translateX(0)';
    card.addEventListener('transitionend', function onEnd() {
      card.style.transition = '';
      card.style.transform = '';
      card.removeEventListener('transitionend', onEnd);
    }, { once: true });
  }

  function doNavigate(card: HTMLDivElement, targetId: string, dir: SlideDir) {
    if (navigatingRef.current) return;
    navigatingRef.current = true;
    if (prefersReducedMotion) {
      navigate(`/entities/${targetId}`, { state: { slideDir: dir } satisfies LocationState });
      return;
    }
    const toX = dir === 'left' ? '-110%' : '110%';
    card.style.transition = 'transform 0.18s ease-out';
    card.style.transform = `translateX(${toX})`;
    setTimeout(() => {
      navigate(`/entities/${targetId}`, { state: { slideDir: dir } satisfies LocationState });
    }, 170);
  }

  function navTo(targetId: string, dir: SlideDir) {
    if (navigatingRef.current) return;
    const card = cardRef.current;
    if (card) doNavigate(card, targetId, dir);
    else {
      navigatingRef.current = true;
      navigate(`/entities/${targetId}`, { state: { slideDir: dir } satisfies LocationState });
    }
  }

  function handlePrev() {
    if (prevId) navTo(prevId, 'right');
  }

  function handleNext() {
    if (nextId) navTo(nextId, 'left');
  }

  // Set initial off-screen position synchronously before first paint so
  // there is never a frame where the new content appears at translateX(0).
  useLayoutEffect(() => {
    const dir = (location.state as LocationState | null)?.slideDir;
    if (!dir || prefersReducedMotion) return;
    const card = cardRef.current;
    if (!card) return;
    card.style.transition = 'none';
    card.style.transform = dir === 'left' ? 'translateX(100%)' : 'translateX(-100%)';
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Animate from off-screen to final position after layout.
  useEffect(() => {
    const dir = (location.state as LocationState | null)?.slideDir;
    if (!dir || prefersReducedMotion) {
      navigatingRef.current = false;
      return;
    }
    const card = cardRef.current;
    if (!card) return;
    requestAnimationFrame(() => {
      card.style.transition = 'transform 0.22s ease-out';
      card.style.transform = 'translateX(0)';
      card.addEventListener('transitionend', function onEnd() {
        card.style.transition = '';
        card.style.transform = '';
        navigatingRef.current = false;
        card.removeEventListener('transitionend', onEnd);
      }, { once: true });
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (pointerRef.current) return;
    if ((e.target as HTMLElement).closest('button')) return;
    if (!hasNav || prefersReducedMotion) return;
    pointerRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      axisLocked: false,
      pointerId: e.pointerId,
      cardEl: e.currentTarget,
    };
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const p = pointerRef.current;
    if (!p) return;
    const dx = e.clientX - p.startX;
    const dy = e.clientY - p.startY;
    if (!p.axisLocked) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      if (Math.abs(dy) > Math.abs(dx)) {
        pointerRef.current = null;
        return;
      }
      p.axisLocked = true;
      p.cardEl.setPointerCapture(p.pointerId);
    }
    const card = cardRef.current;
    if (!card) return;
    const clamped = Math.max(-90, Math.min(90, dx));
    card.style.transition = 'none';
    card.style.transform = `translateX(${clamped}px)`;
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const p = pointerRef.current;
    pointerRef.current = null;
    if (!p?.axisLocked) return;
    const dx = e.clientX - p.startX;
    const card = cardRef.current;
    if (!card) return;
    if (Math.abs(dx) >= 50) {
      const dir: SlideDir = dx < 0 ? 'left' : 'right';
      const targetId = dir === 'left' ? nextId : prevId;
      if (targetId) {
        doNavigate(card, targetId, dir);
      } else {
        springBack(card);
      }
    } else {
      springBack(card);
    }
  }

  function handlePointerCancel() {
    const p = pointerRef.current;
    pointerRef.current = null;
    if (!p?.axisLocked) return;
    const card = cardRef.current;
    if (card) springBack(card);
  }

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    setMenuPos(null);
  }, []);

  const toggleMenu = useCallback(() => {
    setMenuOpen((v) => {
      const next = !v;
      if (next && buttonRef.current) {
        const rect = buttonRef.current.getBoundingClientRect();
        setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
      } else {
        setMenuPos(null);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node;
      const insideButton = menuRef.current?.contains(target) ?? false;
      const insideDropdown = dropdownRef.current?.contains(target) ?? false;
      if (!insideButton && !insideDropdown) closeMenu();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMenu();
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen, closeMenu]);

  function openRenameModal() {
    setRenameValue(entity?.name ?? '');
    setRenameError(null);
    setRenameOpen(true);
    closeMenu();
    setTimeout(() => renameInputRef.current?.select(), 60);
  }

  function closeRenameModal() {
    setRenameOpen(false);
    setRenameError(null);
  }

  async function handleRenameSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = renameValue.trim();
    if (!trimmed) {
      setRenameError('Name cannot be empty.');
      return;
    }
    if (trimmed.length > MAX_NAME_LENGTH) {
      setRenameError(`Name must be ${MAX_NAME_LENGTH} characters or fewer.`);
      return;
    }
    setRenameLoading(true);
    setRenameError(null);
    try {
      await execute('RenameEntity', { entityId: id, name: trimmed });
      closeRenameModal();
    } catch (err: any) {
      setRenameError(err?.message ?? 'Rename failed. Please try again.');
    } finally {
      setRenameLoading(false);
    }
  }

  function handleViewNft() {
    const nftAssetId: string | undefined = (entity as any)?.nftAssetId;
    if (!nftAssetId) return;
    const url = buildNftExplorerUrl(nftAssetId);
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
    closeMenu();
  }

  if (!entity) {
    return (
      <div className="relative w-full p-8 flex flex-col gap-4">
        <p className="text-text-secondary text-sm">Entity not found.</p>
        <button
          className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-white/5 border border-[rgba(139,92,246,0.25)] text-text-primary text-xl cursor-pointer transition-colors active:bg-[rgba(139,92,246,0.28)] active:border-[rgba(139,92,246,0.55)]"
          onClick={() => navigate('/entities')}
        >
          ←
        </button>
      </div>
    );
  }

  const nftAssetId: string | undefined = (entity as any)?.nftAssetId;
  const isNft = isNftEntity(entity);
  const nftExplorerUrl = nftAssetId ? buildNftExplorerUrl(nftAssetId) : null;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {renameOpen && (
        <FullscreenModal onDismiss={closeRenameModal}>
          <div
            className="relative z-10 bg-gradient-to-br from-[#1a1640] to-[#221a50] border border-[rgba(139,92,246,0.4)] rounded-2xl px-5 pt-6 pb-5 w-full max-w-[360px] mx-6 shadow-[0_8px_32px_rgba(0,0,0,0.5)]"
            role="dialog"
            aria-modal="true"
            aria-label="Rename character"
          >
            <h2 className="text-[15px] font-bold text-text-primary mb-3.5 tracking-[0.04em] uppercase m-0">
              Rename Character
            </h2>
            <form onSubmit={handleRenameSubmit}>
              <input
                ref={renameInputRef}
                className="w-full bg-white/[0.06] border border-[rgba(139,92,246,0.35)] rounded-lg px-3 py-2.5 text-text-primary font-[inherit] text-sm outline-none box-border transition-[border-color] duration-150 focus:border-[rgba(139,92,246,0.7)] disabled:opacity-50"
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                maxLength={MAX_NAME_LENGTH}
                placeholder="Enter a name…"
                autoComplete="off"
                disabled={renameLoading}
              />
              <div className="text-right text-[11px] text-text-secondary mt-1">
                {renameValue.trim().length}/{MAX_NAME_LENGTH}
              </div>
              {renameError && (
                <div className="text-xs text-[#f87171] mt-2">{renameError}</div>
              )}
              <div className="flex gap-2.5 mt-4 justify-end">
                <button
                  type="button"
                  className="px-4 py-2 bg-white/[0.06] border border-[rgba(139,92,246,0.25)] rounded-lg text-text-secondary font-[inherit] text-[13px] cursor-pointer transition-[background] duration-150 hover:bg-white/10 disabled:opacity-50 disabled:cursor-default disabled:pointer-events-none"
                  onClick={closeRenameModal}
                  disabled={renameLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[rgba(139,92,246,0.55)] border border-[rgba(139,92,246,0.7)] rounded-lg text-white font-[inherit] text-[13px] font-semibold cursor-pointer transition-[background] duration-150 hover:bg-[rgba(139,92,246,0.75)] disabled:opacity-40 disabled:cursor-default disabled:pointer-events-none"
                  disabled={renameLoading || !renameValue.trim()}
                >
                  {renameLoading ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </FullscreenModal>
      )}

      <div
        className={`relative flex flex-col flex-1 min-h-0 overflow-hidden${!(location.state as LocationState | null)?.slideDir ? ' motion-safe:animate-[detail-enter_0.28s_ease-out_both]' : ''}`}
        ref={cardRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        style={{ touchAction: 'pan-y' }}
      >
        {/* Single scroll container — header is inside so sticky top-0 works */}
        <div className="grid flex-1 min-h-0 overflow-y-auto touch-pan-y [grid-template-rows:auto_1fr]">

          {/* ── Sticky header ── */}
          <div className="bg-[rgba(26,22,64,0.97)] border-b border-[rgba(139,92,246,0.12)] sticky top-0 z-10">
            <div className="flex items-center gap-2 px-3 py-2">
              <button
                className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-white/5 border border-[rgba(139,92,246,0.25)] text-text-primary text-xl cursor-pointer transition-colors flex-shrink-0 active:bg-[rgba(139,92,246,0.28)] active:border-[rgba(139,92,246,0.55)]"
                onClick={() => navigate('/entities')}
                aria-label="Back to entities"
              >
                ←
              </button>

              <div className="flex-1 min-w-0">
                <h1 className="text-sm font-bold tracking-wide text-text-primary truncate m-0">
                  {entity.name.toUpperCase()}
                </h1>
                {(getCollectionLabel(entity) || isPerfectSpecimen(entity)) && (
                  <div className="flex items-center gap-1.5 text-xs text-text-secondary mt-0.5 flex-wrap">
                    {isNftEntity(entity) && (
                      <span className="text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded bg-[rgba(45,212,191,0.15)] border border-[rgba(45,212,191,0.4)] text-[#2dd4bf]">
                        NFT
                      </span>
                    )}
                    {isPerfectSpecimen(entity) ? (
                      <span className="text-[10px] font-bold uppercase tracking-widest text-[#f0abfc]">
                        ★ PERFECT
                        {getPerfectSpecimenTrait(entity) && (
                          <span> · {getPerfectSpecimenTrait(entity)!.toUpperCase()}</span>
                        )}
                      </span>
                    ) : (
                      (() => {
                        const kind = getEntityKind(entity);
                        if (kind === 'perp') {
                          const leaderKind = isLeader(entity);
                          if (leaderKind) {
                            const factionLabel = PERP_FACTION_LABELS[getFaction(entity) ?? ''];
                            return (
                              <span className="text-[10px] font-bold uppercase tracking-widest text-[#fbbf24]">
                                {leaderKind === 'multiverse_leader' ? '★ MULTIVERSE LEADER' : '★ LEADER'}
                                {factionLabel && <span> · {factionLabel}</span>}
                              </span>
                            );
                          }
                        }
                        return (
                          <span className="text-[10px] font-bold uppercase tracking-widest text-text-secondary">
                            {getCollectionLabel(entity)}
                          </span>
                        );
                      })()
                    )}
                  </div>
                )}
              </div>

              <span className="text-base flex-shrink-0" aria-label={entity.status || 'idle'}>
                {statusEmoji(entity.status)}
              </span>

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
                  className="fixed z-[9999] bg-[#1a1640] border border-[rgba(139,92,246,0.3)] rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.5)] p-1 min-w-[140px]"
                  style={{ top: menuPos.top, right: menuPos.right }}
                  role="menu"
                >
                  <button
                    type="button"
                    className="flex items-center gap-2 w-full px-3.5 py-2.5 bg-transparent border-0 text-text-primary text-[13px] font-[inherit] text-left cursor-pointer rounded-md transition-[background] duration-150 whitespace-nowrap hover:bg-[rgba(139,92,246,0.18)] focus-visible:bg-[rgba(139,92,246,0.18)] focus-visible:outline-none"
                    role="menuitem"
                    onClick={openRenameModal}
                  >
                    ✏️ Rename
                  </button>
                  {isNft && nftExplorerUrl && (
                    <button
                      type="button"
                      className="flex items-center gap-2 w-full px-3.5 py-2.5 bg-transparent border-0 text-text-primary text-[13px] font-[inherit] text-left cursor-pointer rounded-md transition-[background] duration-150 whitespace-nowrap hover:bg-[rgba(139,92,246,0.18)] focus-visible:bg-[rgba(139,92,246,0.18)] focus-visible:outline-none"
                      role="menuitem"
                      onClick={handleViewNft}
                    >
                      🔗 View NFT
                    </button>
                  )}
                </div>,
                document.body
              )}

              {hasNav && (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    type="button"
                    className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-white/5 border border-[rgba(139,92,246,0.25)] text-2xl text-text-primary cursor-pointer transition-colors active:bg-[rgba(139,92,246,0.28)] active:border-[rgba(139,92,246,0.55)]"
                    onClick={handlePrev}
                    aria-label="Previous entity"
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-white/5 border border-[rgba(139,92,246,0.25)] text-2xl text-text-primary cursor-pointer transition-colors active:bg-[rgba(139,92,246,0.28)] active:border-[rgba(139,92,246,0.55)]"
                    onClick={handleNext}
                    aria-label="Next entity"
                  >
                    ›
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ── Scrollable entity detail content (1fr row fills remaining space) ── */}
          <EntityDetail entity={entity} variant="full" />

        </div>
      </div>
    </div>
  );
}
