import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import LoginPage       from './pages/LoginPage';
import DashboardPage   from './pages/DashboardPage';
import HistoryPage     from './pages/HistoryPage';
import FlashDevicePage from './pages/FlashDevicePage';
import Navbar          from './components/Navbar';

function PrivateRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen text-slate-400 text-sm">
        Authenticating…
      </div>
    );
  }
  return user ? children : <Navigate to="/login" replace />;
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user ? <Navigate to="/dashboard" replace /> : children;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={
            <PublicRoute>
              <LoginPage />
            </PublicRoute>
          }
        />
        <Route
          path="/dashboard"
          element={
            <PrivateRoute>
              <Navbar />
              <DashboardPage />
            </PrivateRoute>
          }
        />
        <Route
          path="/history"
          element={
            <PrivateRoute>
              <Navbar />
              <HistoryPage />
            </PrivateRoute>
          }
        />
        <Route
          path="/flash"
          element={
            <PrivateRoute>
              <Navbar />
              <FlashDevicePage />
            </PrivateRoute>
          }
        />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
