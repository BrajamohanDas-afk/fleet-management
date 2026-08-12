import { Routes, Route, Navigate } from 'react-router-dom';
import { VideoPanelProvider } from './contexts/VideoPanelContext';
import DashboardLayout from './components/layout/DashboardLayout';
import Vehicles from './pages/Vehicles';
import VehicleLocation from './pages/VehicleLocation';
import VideoTelematics from './pages/VideoTelematics';

export default function App() {
  return (
    <Routes>
      <Route
        path="/dashboard/vehicles"
        element={
          <DashboardLayout>
            <Vehicles />
          </DashboardLayout>
        }
      />
      <Route
        path="/dashboard/location"
        element={
          <DashboardLayout>
            <VehicleLocation />
          </DashboardLayout>
        }
      />
      <Route
        path="/dashboard/video"
        element={
          <DashboardLayout>
            <VideoPanelProvider>
              <VideoTelematics />
            </VideoPanelProvider>
          </DashboardLayout>
        }
      />
      <Route path="/" element={<Navigate to="/dashboard/vehicles" replace />} />
      <Route path="/login" element={<Navigate to="/dashboard/vehicles" replace />} />
      <Route path="*" element={<Navigate to="/dashboard/vehicles" replace />} />
    </Routes>
  );
}
