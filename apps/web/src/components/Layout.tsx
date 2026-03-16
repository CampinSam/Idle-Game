import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAppDispatch } from '../store';
import { useEffect, useState } from 'react';
import { fetchCurrencyDefs } from '../store/gameSlice';
import { logout } from '../store/authSlice';
import { useNotifications } from '../context/NotificationContext';
import { useActiveBoosts } from '../hooks/useActiveBoosts';
import { useJobReadinessTimers } from '../hooks/useJobReadinessTimers';
import {
  useSyncPlayer,
  useSyncCurrencyBalances,
  useAllActiveJobs,
  useSyncGifts,
  useSyncQuests,
} from '../hooks/useSyncSelectors';
import { useAppSelector } from '../store';
import ToastOverlay from './ToastOverlay';
import type { SyncStatus } from '../store/syncSlice';
import NotificationCenter from '../features/notifications/NotificationCenter';
import { formatCompact } from '../utils/formatNumber';
import { resolveIcon } from '../utils/iconResolver';
import GameIcon from './GameIcon';
import './Layout.css';

export default function Layout() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const profile = useSyncPlayer();
  const currencyBalances = useSyncCurrencyBalances();
  const currencyDefs = useAppSelector((s) => s.game.currencyDefs);
  const syncStatus = useAppSelector((s) => s.sync.status) as SyncStatus;
  const { unreadCount } = useNotifications();
  const boostInfo = useActiveBoosts();

  const allActiveJobs = useAllActiveJobs();
  const gifts = useSyncGifts();
  const quests = useSyncQuests();

  useJobReadinessTimers(allActiveJobs);
  const [showMenu, setShowMenu] = useState(false);
  const [showNotifCenter, setShowNotifCenter] = useState(false);

  const hasClaimableRewards = gifts.some((g: any) => g.status === 'UNCLAIMED') || quests.some((q: any) => q.status === 'completed');

  useEffect(() => {
    if (currencyDefs.length === 0) dispatch(fetchCurrencyDefs());
  }, [dispatch, currencyDefs.length]);

  const handleLogout = () => {
    dispatch(logout());
    navigate('/login');
    setShowMenu(false);
  };

  const isOffline = syncStatus === 'disconnected' || syncStatus === 'reconnecting';

  return (
    <div className="layout">
      {isOffline && (
        <div className={`sync-offline-banner${syncStatus === 'reconnecting' ? ' reconnecting' : ''}`} role="alert">
          <span>⚠</span>
          {syncStatus === 'reconnecting' ? 'Connection lost — reconnecting...' : 'You are offline'}
        </div>
      )}
      {profile && (
        <div className="top-bar-container">
          <div className="top-bar">
            <div className="top-bar-avatar-wrap">
              <button className="top-bar-avatar-btn" onClick={() => setShowMenu(!showMenu)}>
                <svg className="top-bar-progress-ring" viewBox="0 0 48 48">
                  <circle className="progress-ring-bg" cx="24" cy="24" r="21" />
                  <circle
                    className="progress-ring-fill"
                    cx="24" cy="24" r="21"
                    strokeDasharray={`${2 * Math.PI * 21}`}
                    strokeDashoffset={`${2 * Math.PI * 21 * (1 - Math.min(1, Math.max(0, profile.keeperXp / (profile.xpToNextLevel || 100))))}`}
                  />
                </svg>
                <img className="top-bar-avatar-img" src="/images/icon-entities.png" alt="" />
                <span className="top-bar-level-center">{profile.keeperLevel}</span>
              </button>
              {showMenu && (
                <div className="top-bar-menu">
                  <div className="top-bar-menu-name">{profile.username}</div>
                  <div className="top-bar-menu-info">Keeper Lvl {profile.keeperLevel}</div>
                  <button className="top-bar-menu-profile" onClick={() => { navigate('/profile'); setShowMenu(false); }}>Profile & Wallets</button>
                  <button className="top-bar-menu-profile" onClick={() => { navigate('/rewards'); setShowMenu(false); }}>Rewards</button>
                  <button className="top-bar-menu-logout" onClick={handleLogout}>Logout</button>
                </div>
              )}
            </div>
            <span className="top-bar-name">{profile.username}</span>
            <div className="top-bar-currencies">
              <div className="top-bar-currency">
                <span className="top-bar-currency-icon"><GameIcon src="soft_arcanium" size={16} /></span>
                <span className="top-bar-currency-val">{formatCompact(currencyBalances['soft_arcanium'] ?? 0)}</span>
              </div>
              <div className="top-bar-currency">
                <span className="top-bar-currency-icon"><GameIcon src={resolveIcon('CURRENCY', 'hard_essence', currencyDefs, [])} size={16} /></span>
                <span className="top-bar-currency-val">{formatCompact(currencyBalances['hard_essence'] ?? 0)}</span>
              </div>
              <div className="top-bar-currency">
                <span className="top-bar-currency-icon"><GameIcon src={resolveIcon('CURRENCY', 'premium_gems', currencyDefs, [])} size={16} /></span>
                <span className="top-bar-currency-val">{formatCompact(currencyBalances['premium_gems'] ?? 0)}</span>
              </div>
            </div>
            <button className="top-bar-bell" onClick={() => setShowNotifCenter(true)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              {unreadCount > 0 && (
                <span className="bell-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
              )}
              {boostInfo.boostActive && (
                <span className="bell-boost-indicator" title={boostInfo.boostLabel}>⚡</span>
              )}
            </button>
          </div>
        </div>
      )}

      <ToastOverlay />

      {showNotifCenter && (
        <NotificationCenter onClose={() => setShowNotifCenter(false)} boostInfo={boostInfo} />
      )}

      <main className="content page-outlet">
        <div className="page-transition-wrapper">
          <Outlet />
        </div>
      </main>

      {hasClaimableRewards && (
        <button
          className="reward-badge-fab"
          onClick={() => navigate('/rewards')}
          aria-label="Claimable rewards"
        >
          🎁
        </button>
      )}

      <nav className="bottom-nav">
        <NavLink to="/" end className={({ isActive }) => `bnav-link ${isActive ? 'active' : ''}`}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          <span>Home</span>
        </NavLink>
        <NavLink to="/missions" className={({ isActive }) => `bnav-link ${isActive ? 'active' : ''}`}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
          <span>Missions</span>
        </NavLink>
        <NavLink to="/entities" className={({ isActive }) => `bnav-link ${isActive ? 'active' : ''}`}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8c0-3.3-2.7-6-6-6S6 4.7 6 8c0 2.5 1.5 4.6 3.7 5.5L8 22h8l-1.7-8.5C16.5 12.6 18 10.5 18 8z"/><circle cx="9" cy="8" r="1"/><circle cx="15" cy="8" r="1"/></svg>
          <span>Entities</span>
        </NavLink>
        <NavLink to="/inventory" className={({ isActive }) => `bnav-link ${isActive ? 'active' : ''}`}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><path d="M12 12v3"/><path d="M2 12h20"/></svg>
          <span>Items</span>
        </NavLink>
        <NavLink to="/locations" className={({ isActive }) => `bnav-link ${isActive ? 'active' : ''}`}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="10" width="16" height="12" rx="1"/><path d="M12 2l8 8H4z"/><rect x="9" y="15" width="6" height="7"/></svg>
          <span>Outpost</span>
        </NavLink>
        <NavLink to="/store" className={({ isActive }) => `bnav-link ${isActive ? 'active' : ''}`}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>
          <span>Store</span>
        </NavLink>
      </nav>
    </div>
  );
}
