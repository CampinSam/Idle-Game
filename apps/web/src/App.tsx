import { useEffect } from 'react';
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
import HomePage from './features/home/HomePage';
import EntitiesPage from './features/entities/EntitiesPage';
import EntityDetailPage from './features/entities/EntityDetailPage';
import LocationsPage from './features/locations/LocationsPage';
import LocationDetailPage from './features/locations/LocationDetailPage';
import MissionsPage from './features/missions/MissionsPage';
import CraftingPage from './features/crafting/CraftingPage';
import InventoryPage from './features/inventory/InventoryPage';
import AdminPage from './features/admin/AdminPage';
import AdminDashboard from './features/admin/AdminDashboard';
import SmartAdminPage from './features/admin/smart/SmartAdminPage';
import ErrorBoundary from './components/ErrorBoundary';

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
      // locations, entities, and other instance data are served by the sync bootstrap
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
    return <SmartAdminPage />;
  }
  if (location.pathname.startsWith('/admin/def')) {
    return <AdminPage />;
  }
  if (location.pathname.startsWith('/admin')) {
    return <AdminDashboard />;
  }

  return (
    <AuthGate>
      <TickEngineProvider>
      <NotificationProvider>
      <ModalProvider>
      <Routes>
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
      <GameModalHost />
      </ModalProvider>
      </NotificationProvider>
      </TickEngineProvider>
    </AuthGate>
  );
}
