import { useState, useCallback, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppSelector } from '../../store';
import { EntityDetail } from './components';
import { getEntityStatusLabel } from './utils';
import './EntityDetailPage.css';

export default function EntityDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const entity = useAppSelector((s) => s.sync.entities[id ?? '']);

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

  const statusKey = (entity.status || 'idle').toLowerCase();
  const statusLabel = getEntityStatusLabel(entity.status);

  return (
    <div className="entity-detail-page">
      <div className="entity-detail-page__card">
        <div className="entity-detail-page__header">
          <button className="entity-detail-page__back-btn" onClick={() => navigate('/entities')}>←</button>
          <h1 className="entity-detail-page__name">{entity.name}</h1>
          <span className={`entity-detail-page__status-pill entity-detail-page__status-pill--${statusKey}`}>
            {statusLabel}
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
        </div>
        <EntityDetail entity={entity} variant="full" />
      </div>
    </div>
  );
}
