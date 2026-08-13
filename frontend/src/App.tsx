import { Routes, Route, Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { VideoPanelProvider } from './contexts/VideoPanelContext';
import DashboardLayout from './components/layout/DashboardLayout';
import Vehicles from './pages/Vehicles';
import VehicleLocation from './pages/VehicleLocation';
import VideoTelematics from './pages/VideoTelematics';
import Login from './pages/Login';
import { getToken } from './services/auth';
import { ThemeProvider } from './contexts/ThemeContext';
import PublicShare from './pages/PublicShare';

function ProtectedRoute({ children }: { children: ReactNode }) {
  if (!getToken()) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <ThemeProvider>
      <Routes>
        <Route path="/share/:token" element={<PublicShare />} />
        <Route
          path="/dashboard/vehicles"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <Vehicles />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/location"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <VehicleLocation />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/video"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <VideoPanelProvider>
                  <VideoTelematics />
                </VideoPanelProvider>
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route path="/" element={<Navigate to="/dashboard/vehicles" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/dashboard/vehicles" replace />} />
      </Routes>
    </ThemeProvider>
  );
}
