import { lazy, Suspense, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAppSelector, useAppDispatch } from './store';
import { restoreSession } from './store/authSlice';
import { fetchCurrencyDefs, fetchItemDefs, fetchEffectDefs } from './store/gameSlice';
import { useSyncEngine } from './hooks/useSyncEngine';
import { useGlobalPowerToasts } from './hooks/useGlobalPowerToasts';
import { NotificationProvider } from './context/NotificationContext';
import { ModalProvider } from './context/ModalContext';
import { BodyCardVariantProvider } from './context/BodyCardVariantContext';
import GameModalHost from './components/modal/GameModalHost';
import { TickEngineProvider } from './tick';
import Layout from './components/Layout';
import LoginPage from './features/auth/LoginPage';
import RegisterPage from './features/auth/RegisterPage';
import WalletOnboardingPage from './features/auth/WalletOnboardingPage';
import ErrorBoundary from './components/ErrorBoundary';

const HomePage = lazy(() => import('./features/home/HomePage'));
const EntitiesPage = lazy(() => import('./features/entities/EntitiesPage'));
const EntityDetailPage = lazy(() => import('./features/entities/EntityDetailPage'));
const LocationsPage = lazy(() => import('./features/locations/LocationsPage'));
const LocationDetailPage = lazy(() => import('./features/locations/LocationDetailPage'));
const MissionsPage = lazy(() => import('./features/missions/MissionsPage'));
const CraftingRedirect = lazy(() => import('./features/crafting/CraftingRedirect'));
const ForgePage = lazy(() => import('./features/forge/ForgePage'));
const InventoryPage = lazy(() => import('./features/inventory/InventoryPage'));
const AdminDashboard = lazy(() => import('./features/admin/AdminDashboard'));
const SmartAdminPage = lazy(() => import('./features/admin/smart/SmartAdminPage'));
const ModalEditorPage = lazy(() => import('./features/admin/modal-editor/ModalEditorPage'));
const IconManagerPage = lazy(() => import('./features/admin/icons/IconManagerPage'));
const AudioManagerPage = lazy(() => import('./features/admin/audio/AudioManagerPage'));
const BalancePage = lazy(() => import('./features/admin/balance/BalancePage'));
const TagEditorPage = lazy(() => import('./features/admin/tag-editor/TagEditorPage'));
const SelectionTesterPage = lazy(() => import('./features/admin/selection-tester/SelectionTesterPage'));
const TelemetryAdminPage = lazy(() => import('./features/admin/telemetry/TelemetryAdminPage'));
const PlayerEventsAdminPage = lazy(() => import('./features/admin/player-events/PlayerEventsAdminPage'));
const ProfilePage = lazy(() => import('./features/profile/ProfilePage'));
const SettingsPage = lazy(() => import('./features/settings/SettingsPage'));
const StorePage = lazy(() => import('./features/store/StorePage'));
const RewardsPage = lazy(() => import('./features/rewards/RewardsPage'));
const AchievementsPage = lazy(() => import('./features/achievements/AchievementsPage'));

function PageLoader() {
  return (
    <div className="auth-loading">
      <div className="auth-loading-spinner" />
    </div>
  );
}

function AuthGate({ children }: { children: React.ReactNode }) {
  const { token, initializing } = useAppSelector((s) => s.auth);
  const dispatch = useAppDispatch();

  useSyncEngine();
  useGlobalPowerToasts();

  useEffect(() => {
    if (token && initializing) {
      dispatch(restoreSession());
    }
  }, [token, initializing, dispatch]);

  useEffect(() => {
    if (token && !initializing) {
      dispatch(fetchCurrencyDefs());
      dispatch(fetchItemDefs());
      dispatch(fetchEffectDefs());
    }
  }, [token, initializing, dispatch]);

  if (initializing) {
    return (
      <div className="auth-loading">
        <div className="auth-loading-spinner" />
        <p>Loading your adventure...</p>
      </div>
    );
  }

  if (!token) {
    return (
      <Routes>
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/onboarding/wallet" element={<WalletOnboardingPage />} />
        <Route path="*" element={<LoginPage />} />
      </Routes>
    );
  }

  return <>{children}</>;
}

export default function App() {
  const location = useLocation();

  if (location.pathname.startsWith('/admin/modal-editor')) {
    return (
      <Suspense fallback={<PageLoader />}>
        <ModalEditorPage />
      </Suspense>
    );
  }
  if (location.pathname.startsWith('/admin/def')) {
    return (
      <Suspense fallback={<PageLoader />}>
        <SmartAdminPage />
      </Suspense>
    );
  }
  if (location.pathname.startsWith('/admin/icons')) {
    return (
      <Suspense fallback={<PageLoader />}>
        <IconManagerPage />
      </Suspense>
    );
  }
  if (location.pathname.startsWith('/admin/audio')) {
    return (
      <Suspense fallback={<PageLoader />}>
        <AudioManagerPage />
      </Suspense>
    );
  }
  if (location.pathname.startsWith('/admin/balance')) {
    return (
      <Suspense fallback={<PageLoader />}>
        <BalancePage />
      </Suspense>
    );
  }
  if (location.pathname.startsWith('/admin/tag-editor')) {
    return (
      <Suspense fallback={<PageLoader />}>
        <TagEditorPage />
      </Suspense>
    );
  }
  if (location.pathname.startsWith('/admin/selection-tester')) {
    return (
      <Suspense fallback={<PageLoader />}>
        <SelectionTesterPage />
      </Suspense>
    );
  }
  if (location.pathname.startsWith('/admin/telemetry')) {
    return (
      <Suspense fallback={<PageLoader />}>
        <TelemetryAdminPage />
      </Suspense>
    );
  }
  if (location.pathname.startsWith('/admin/player-events')) {
    return (
      <Suspense fallback={<PageLoader />}>
        <PlayerEventsAdminPage />
      </Suspense>
    );
  }
  if (location.pathname.startsWith('/admin')) {
    return (
      <Suspense fallback={<PageLoader />}>
        <AdminDashboard />
      </Suspense>
    );
  }

  return (
    <AuthGate>
      <TickEngineProvider>
      <NotificationProvider>
      <ModalProvider>
      <BodyCardVariantProvider>
      <Routes>
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="/register" element={<Navigate to="/" replace />} />
        <Route path="/" element={<Layout />}>
          <Route index element={<ErrorBoundary fallbackTitle="Home page error"><HomePage /></ErrorBoundary>} />
          <Route path="entities" element={<ErrorBoundary fallbackTitle="Entities page error"><EntitiesPage /></ErrorBoundary>} />
          <Route path="entities/:id" element={<ErrorBoundary fallbackTitle="Entity detail error"><EntityDetailPage /></ErrorBoundary>} />
          <Route path="locations" element={<ErrorBoundary fallbackTitle="Locations page error"><LocationsPage /></ErrorBoundary>} />
          <Route path="locations/:id" element={<ErrorBoundary fallbackTitle="Location detail error"><LocationDetailPage /></ErrorBoundary>} />
          <Route path="locations/:id/workshop" element={<ErrorBoundary fallbackTitle="Forge error"><ForgePage /></ErrorBoundary>} />
          <Route path="missions" element={<ErrorBoundary fallbackTitle="Missions page error"><MissionsPage /></ErrorBoundary>} />
          <Route path="inventory" element={<ErrorBoundary fallbackTitle="Inventory page error"><InventoryPage /></ErrorBoundary>} />
          <Route path="crafting" element={<ErrorBoundary fallbackTitle="Crafting redirect error"><CraftingRedirect /></ErrorBoundary>} />
          <Route path="profile" element={<ErrorBoundary fallbackTitle="Profile page error"><ProfilePage /></ErrorBoundary>} />
          <Route path="settings" element={<ErrorBoundary fallbackTitle="Settings page error"><SettingsPage /></ErrorBoundary>} />
          <Route path="store" element={<ErrorBoundary fallbackTitle="Store page error"><StorePage /></ErrorBoundary>} />
          <Route path="rewards" element={<ErrorBoundary fallbackTitle="Rewards page error"><RewardsPage /></ErrorBoundary>} />
          <Route path="achievements" element={<ErrorBoundary fallbackTitle="Achievements page error"><Suspense fallback={<PageLoader />}><AchievementsPage /></Suspense></ErrorBoundary>} />
        </Route>
      </Routes>
      <GameModalHost />
      </BodyCardVariantProvider>
      </ModalProvider>
      </NotificationProvider>
      </TickEngineProvider>
    </AuthGate>
  );
}
