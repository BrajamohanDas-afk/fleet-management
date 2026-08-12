import { Routes, Route, Navigate } from 'react-router-dom';
import { VideoPanelProvider } from './contexts/VideoPanelContext';
import Vehicles from './pages/Vehicles';
import VehicleLocation from './pages/VehicleLocation';
import VideoTelematics from './pages/VideoTelematics';

export default function App() {
  return (
    <Routes>
      <Route path="/dashboard/vehicles" element={<Vehicles />} />
      <Route path="/dashboard/location" element={<VehicleLocation />} />
      <Route
        path="/dashboard/video"
        element={
          <VideoPanelProvider>
            <VideoTelematics />
          </VideoPanelProvider>
        }
      />
      <Route path="/" element={<Navigate to="/dashboard/vehicles" replace />} />
      <Route path="/login" element={<Navigate to="/dashboard/vehicles" replace />} />
      <Route path="*" element={<Navigate to="/dashboard/vehicles" replace />} />
    </Routes>
  );
}
