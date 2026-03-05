import { lazy, Suspense, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAppSelector, useAppDispatch } from './store';
import { restoreSession } from './store/authSlice';
import { fetchCurrencyDefs, fetchItemDefs } from './store/gameSlice';
import { useSyncEngine } from './hooks/useSyncEngine';
import { NotificationProvider } from './context/NotificationContext';
import { ModalProvider } from './context/ModalContext';
import GameModalHost from './components/modal/GameModalHost';
import { TickEngineProvider } from './tick';
import Layout from './components/Layout';
import LoginPage from './features/auth/LoginPage';
import RegisterPage from './features/auth/RegisterPage';
import ErrorBoundary from './components/ErrorBoundary';

const HomePage = lazy(() => import('./features/home/HomePage'));
const EntitiesPage = lazy(() => import('./features/entities/EntitiesPage'));
const EntityDetailPage = lazy(() => import('./features/entities/EntityDetailPage'));
const LocationsPage = lazy(() => import('./features/locations/LocationsPage'));
const LocationDetailPage = lazy(() => import('./features/locations/LocationDetailPage'));
const MissionsPage = lazy(() => import('./features/missions/MissionsPage'));
const CraftingPage = lazy(() => import('./features/crafting/CraftingPage'));
const InventoryPage = lazy(() => import('./features/inventory/InventoryPage'));
const AdminPage = lazy(() => import('./features/admin/AdminPage'));
const AdminDashboard = lazy(() => import('./features/admin/AdminDashboard'));
const SmartAdminPage = lazy(() => import('./features/admin/smart/SmartAdminPage'));

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

  useEffect(() => {
    if (token && initializing) {
      dispatch(restoreSession());
    }
  }, [token, initializing, dispatch]);

  useEffect(() => {
    if (token && !initializing) {
      dispatch(fetchCurrencyDefs());
      dispatch(fetchItemDefs());
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
        <Route path="*" element={<LoginPage />} />
      </Routes>
    );
  }

  return <>{children}</>;
}

export default function App() {
  const location = useLocation();

  if (location.pathname.startsWith('/admin/def2')) {
    return (
      <Suspense fallback={<PageLoader />}>
        <SmartAdminPage />
      </Suspense>
    );
  }
  if (location.pathname.startsWith('/admin/def')) {
    return (
      <Suspense fallback={<PageLoader />}>
        <AdminPage />
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
      <Suspense fallback={<PageLoader />}>
      <Routes location={location} key={location.key}>
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="/register" element={<Navigate to="/" replace />} />
        <Route path="/" element={<Layout />}>
          <Route index element={<ErrorBoundary fallbackTitle="Home page error"><HomePage /></ErrorBoundary>} />
          <Route path="entities" element={<ErrorBoundary fallbackTitle="Entities page error"><EntitiesPage /></ErrorBoundary>} />
          <Route path="entities/:id" element={<ErrorBoundary fallbackTitle="Entity detail error"><EntityDetailPage /></ErrorBoundary>} />
          <Route path="locations" element={<ErrorBoundary fallbackTitle="Locations page error"><LocationsPage /></ErrorBoundary>} />
          <Route path="locations/:id" element={<ErrorBoundary fallbackTitle="Location detail error"><LocationDetailPage /></ErrorBoundary>} />
          <Route path="missions" element={<ErrorBoundary fallbackTitle="Missions page error"><MissionsPage /></ErrorBoundary>} />
          <Route path="inventory" element={<ErrorBoundary fallbackTitle="Inventory page error"><InventoryPage /></ErrorBoundary>} />
          <Route path="crafting" element={<ErrorBoundary fallbackTitle="Crafting page error"><CraftingPage /></ErrorBoundary>} />
        </Route>
      </Routes>
      </Suspense>
      <GameModalHost />
      </ModalProvider>
      </NotificationProvider>
      </TickEngineProvider>
    </AuthGate>
  );
}
