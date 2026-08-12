import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import Login from './pages/Login';
import Vehicles from './pages/Vehicles';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
}

function Placeholder({ title }: { title: string }) {
  return <div>{title}</div>;
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
            <Placeholder title="Location" />
          </ProtectedRoute>
        }
      />
      <Route
        path="/dashboard/video"
        element={
          <ProtectedRoute>
            <Placeholder title="Video" />
          </ProtectedRoute>
        }
      />
      <Route path="/" element={<Navigate to="/dashboard/vehicles" replace />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
