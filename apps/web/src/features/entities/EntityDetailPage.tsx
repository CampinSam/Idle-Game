import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAppSelector } from '../../store';
import { EntityDetail } from './components';
import { getFilteredSortedEntities } from './entityListUtils';
import { getEntityKind } from './registry';
import { isNftEntity } from './types/derp_bird/isNftEntity';
import { isPerfectSpecimen, getPerfectSpecimenTrait } from './types/derp_bird/isPerfectSpecimen';
import { useScrollLock } from '../../hooks/useScrollLock';
import type { EntityFilter, EntitySortBy } from './types';
import './EntityDetailPage.css';

function getCollectionLabel(entity: any): string | null {
  const kind = getEntityKind(entity);
  if (kind === 'derp_bird') return 'Derp Bird Collection';
  return null;
}

const STORAGE_KEY_FILTER = 'entities_activeFilter';
const STORAGE_KEY_SORT   = 'entities_sortBy';
const STORAGE_KEY_SEARCH = 'entities_searchQuery';

type SlideDir = 'left' | 'right';
type LocationState = { slideDir?: SlideDir };

function safeGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

function readBrowseFilter(): EntityFilter {
  const v = safeGet(STORAGE_KEY_FILTER);
  if (v === 'ALL' || v === 'DERPS' || v === 'VAMPS' || v === 'PREDS') return v;
  return 'ALL';
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

export default function EntityDetailPage() {
  useScrollLock();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const mountedRef = useRef(false);
  const navigatingRef = useRef(false);
  const pointerRef = useRef<{
    startX: number;
    startY: number;
    axisLocked: boolean;
    pointerId: number;
    cardEl: HTMLDivElement;
  } | null>(null);

  const entity = useAppSelector((s) => s.sync.entities[id ?? '']);
  const entityMap = useAppSelector((s) => s.sync.entities);

  const browseFilter = useMemo(readBrowseFilter, []);
  const browseSortBy = useMemo(readBrowseSort, []);
  const browseSearch = useMemo(() => safeGet(STORAGE_KEY_SEARCH) ?? '', []);

  const allEntities = useMemo(() => Object.values(entityMap), [entityMap]);

  const navList = useMemo(
    () => getFilteredSortedEntities(allEntities, browseFilter, browseSearch, browseSortBy),
    [allEntities, browseFilter, browseSearch, browseSortBy],
  );

  const currentIdx = navList.findIndex((e) => e.id === id);
  const total = navList.length;
  const hasNav = total > 1 && currentIdx >= 0;
  const prevId: string | undefined = hasNav ? navList[(currentIdx - 1 + total) % total]?.id : undefined;
  const nextId: string | undefined = hasNav ? navList[(currentIdx + 1) % total]?.id : undefined;

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

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    const state = location.state as LocationState | null;
    const dir = state?.slideDir;
    if (!dir) return;
    const card = cardRef.current;
    if (!card) return;
    const fromX = dir === 'left' ? '100%' : '-100%';
    card.style.transition = 'none';
    card.style.transform = `translateX(${fromX})`;
    requestAnimationFrame(() => {
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
    });
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (pointerRef.current) return;
    if ((e.target as HTMLElement).closest('button')) return;
    if (!hasNav) return;
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

  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const toggleMenu = useCallback(() => setMenuOpen((v) => !v), []);

  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) closeMenu();
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

  if (!entity) {
    return (
      <div className="entity-detail-page">
        <div className="entity-detail-page__loading">Entity not found.</div>
        <button className="entity-detail-page__back-btn" onClick={() => navigate('/entities')}>←</button>
      </div>
    );
  }

  return (
    <div className="entity-detail-page">
      <div
        className={[
          'entity-detail-page__card',
          getEntityKind(entity) === 'derp_bird' && (isPerfectSpecimen(entity) ? 'entity-detail-page__card--perfect' : 'entity-detail-page__card--derp-bird'),
        ].filter(Boolean).join(' ')}
        ref={cardRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        style={{ touchAction: 'pan-y' }}
      >
        <div className="entity-detail-page__header-card">
        <div className="entity-detail-page__header">
          <button
            className="entity-detail-page__back-btn"
            onClick={() => navigate('/entities')}
            aria-label="Back to entities"
          >
            ←
          </button>

          <div className="entity-detail-page__name-block">
            <h1 className="entity-detail-page__name">{entity.name.toUpperCase()}</h1>
            {(getCollectionLabel(entity) || isPerfectSpecimen(entity)) && (
              <div className="entity-detail-page__name-sub">
                {isNftEntity(entity) && (
                  <span className="entity-detail-page__nft-chip">NFT</span>
                )}
                {isPerfectSpecimen(entity) ? (
                  <span className="entity-detail-page__perfect-chip">
                    ★ PERFECT
                    {getPerfectSpecimenTrait(entity) && (
                      <span> · {getPerfectSpecimenTrait(entity)!.toUpperCase()}</span>
                    )}
                  </span>
                ) : (
                  getCollectionLabel(entity)
                )}
              </div>
            )}
          </div>

          <span className="entity-detail-page__status-dot" aria-label={entity.status || 'idle'}>
            {statusEmoji(entity.status)}
          </span>

          <div className="entity-detail-page__header-icons" ref={menuRef}>
            <button
              type="button"
              className="entity-detail-page__icon-btn"
              onClick={toggleMenu}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              ⚙️
            </button>
            {menuOpen && (
              <div className="entity-detail-page__menu" role="menu">
                <div className="entity-detail-page__menu-empty">No actions yet</div>
              </div>
            )}
          </div>

          {hasNav && (
            <div className="entity-detail-page__nav-group">
              <button
                type="button"
                className="entity-detail-page__nav-btn"
                onClick={handlePrev}
                aria-label="Previous entity"
              >
                ‹
              </button>
              <button
                type="button"
                className="entity-detail-page__nav-btn"
                onClick={handleNext}
                aria-label="Next entity"
              >
                ›
              </button>
            </div>
          )}
        </div>
      </div>

        <EntityDetail entity={entity} variant="full" />
      </div>
    </div>
  );
}
