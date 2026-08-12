import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { VideoPanelProvider } from './contexts/VideoPanelContext';
import Login from './pages/Login';
import Vehicles from './pages/Vehicles';
import VehicleLocation from './pages/VehicleLocation';
import VideoTelematics from './pages/VideoTelematics';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/dashboard/vehicles"
        element={
          <ProtectedRoute>
            <Vehicles />
          </ProtectedRoute>
        }
      />
      <Route
        path="/dashboard/location"
        element={
          <ProtectedRoute>
            <VehicleLocation />
          </ProtectedRoute>
        }
      />
      <Route
        path="/dashboard/video"
        element={
          <ProtectedRoute>
            <VideoPanelProvider>
              <VideoTelematics />
            </VideoPanelProvider>
          </ProtectedRoute>
        }
      />
      <Route path="/" element={<Navigate to="/dashboard/vehicles" replace />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
