import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { LatLngBounds } from 'leaflet';
import type { LatLngExpression } from 'leaflet';
import { useAllVehicles } from '../hooks/useAllVehicles';
import { useVideoChannels } from '../hooks/useVideoChannels';
import VideoControls from '../components/video/VideoControls';
import VideoPanel from '../components/video/VideoPanel';
import SaveVideoModal from '../components/video/SaveVideoModal';
import RecordingsModal from '../components/video/RecordingsModal';
import { formatInIst } from '../utils/formatDate';
import type { DeviceChannelOut, DeviceHealth, VehicleStatus } from '../types';

type LayoutMode = 'side-by-side' | 'front-focus' | 'rear-focus';

const LAYOUT_OPTIONS: { value: LayoutMode; label: string }[] = [
  { value: 'side-by-side', label: 'Side-by-side' },
  { value: 'front-focus', label: 'Front focus' },
  { value: 'rear-focus', label: 'Rear focus' },
];

const STATUS_LABELS: Record<VehicleStatus, string> = {
  moving: 'Running',
  standing: 'Stationary',
  stale: 'Stale',
  offline: 'Offline',
};

type PanelConfig = Pick<
  DeviceChannelOut,
  'channel_no' | 'label' | 'stream_url'
> & {
  health: DeviceHealth | null;
};

function deriveCameraState(healthItems: DeviceHealth[]): string {
  if (healthItems.length === 0) return 'No cameras';
  if (healthItems.every((h) => h.state === 'live')) return 'Live';
  if (healthItems.every((h) => h.state === 'offline')) return 'Offline';
  if (healthItems.some((h) => h.state === 'live')) return 'Partial';
  return 'Connecting';
}

function formatLastSeen(value: string | null | undefined): string {
  return formatInIst(value);
}

const DEFAULT_CENTER: LatLngExpression = [17.385, 78.4867];
const HYDERABAD_BOUNDS = new LatLngBounds(
  [17.25, 78.35],
  [17.55, 78.65]
);

export default function VideoTelematics() {
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    vehicles,
    isLoading: vehiclesLoading,
    error: vehiclesError,
  } = useAllVehicles();
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | null>(null);
  const [layout, setLayout] = useState<LayoutMode>('side-by-side');
  const [isStreaming, setIsStreaming] = useState(false);
  const [reconnectSignal, setReconnectSignal] = useState(0);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [isRecordingsModalOpen, setIsRecordingsModalOpen] = useState(false);

  useEffect(() => {
    const vehicleIdParam = searchParams.get('vehicleId');
    if (vehicleIdParam) {
      setSelectedVehicleId(Number(vehicleIdParam));
    }
  }, [searchParams]);

  useEffect(() => {
    if (selectedVehicleId || vehicles.length === 0) return;
    setSelectedVehicleId(vehicles[0].id);
  }, [vehicles, selectedVehicleId]);

  const selectedVehicle = useMemo(
    () => vehicles.find((v) => v.id === selectedVehicleId) ?? null,
    [vehicles, selectedVehicleId]
  );

  const deviceId = selectedVehicle?.latest?.device_id ?? null;
  const {
    channels,
    health,
    isLoading: channelsLoading,
  } = useVideoChannels(deviceId);

  const panels: PanelConfig[] = useMemo(() => {
    return channels.slice(0, 2).map((channel) => ({
      ...channel,
      health:
        health.find((h) => h.channel_no === channel.channel_no) ?? null,
    }));
  }, [channels, health]);

  const handleVehicleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const id = Number(event.target.value);
    setSelectedVehicleId(id);
    setSearchParams({ vehicleId: String(id) });
  };

  const handleStartCameras = () => setIsStreaming(true);
  const handleStopCameras = () => setIsStreaming(false);
  const handleReconnectView = () => setReconnectSignal((prev) => prev + 1);
  const handleSaveVideo = () => setIsSaveModalOpen(true);
  const handleSavedVideos = () => setIsRecordingsModalOpen(true);

  const cameraState = deriveCameraState(health);
  const latest = selectedVehicle?.latest;
  const mapCenter: LatLngExpression =
    latest?.latitude && latest?.longitude
      ? [latest.latitude, latest.longitude]
      : DEFAULT_CENTER;

  const frontPanel = panels.find((p) =>
    p.label.toLowerCase().includes('front')
  ) ?? panels[0];
  const rearPanel = panels.find((p) =>
    p.label.toLowerCase().includes('rear')
  ) ?? panels[1];

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 rounded-xl bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              Video Telematics
            </h1>
            <p className="text-sm text-slate-500">
              Live camera streams and vehicle telemetry
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <select
              value={selectedVehicleId ?? ''}
              onChange={handleVehicleChange}
              disabled={vehiclesLoading}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 disabled:opacity-60"
            >
              <option value="" disabled>
                Select vehicle
              </option>
              {vehicles.map((vehicle) => (
                <option key={vehicle.id} value={vehicle.id}>
                  {vehicle.registration_no}
                </option>
              ))}
            </select>

            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-1">
              {LAYOUT_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setLayout(option.value)}
                  className={[
                    'rounded-md px-3 py-1.5 text-sm font-medium',
                    layout === option.value
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900',
                  ].join(' ')}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <VideoControls
              isStreaming={isStreaming}
              onStartCameras={handleStartCameras}
              onStopCameras={handleStopCameras}
              onSaveVideo={handleSaveVideo}
              onReconnectView={handleReconnectView}
              onSavedVideos={handleSavedVideos}
            />
          </div>
        </div>

        {vehiclesError && (
          <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700">
            Failed to load vehicles: {vehiclesError.message}
          </div>
        )}

        {selectedVehicle && (
          <div className="grid grid-cols-2 gap-4 rounded-xl bg-white p-4 shadow-sm md:grid-cols-4">
            <StatusItem label="Vehicle" value={selectedVehicle.registration_no} />
            <StatusItem label="Cameras" value={cameraState} />
            <StatusItem
              label="GPS"
              value={latest?.status ? STATUS_LABELS[latest.status] : '--'}
            />
            <StatusItem
              label="Last Seen"
              value={formatLastSeen(latest?.received_at)}
            />
          </div>
        )}

        {!selectedVehicle && !vehiclesLoading && (
          <div className="rounded-xl bg-white p-8 text-center text-slate-500 shadow-sm">
            No vehicle selected.
          </div>
        )}

        {selectedVehicle && !deviceId && (
          <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800 shadow-sm">
            Selected vehicle has no assigned device.
          </div>
        )}

        {channelsLoading && deviceId && (
          <div className="rounded-xl bg-white p-8 text-center text-slate-500 shadow-sm">
            Loading camera channels…
          </div>
        )}

        {panels.length > 0 && (
          <div
            className={[
              'grid gap-4',
              layout === 'side-by-side' ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1',
            ].join(' ')}
          >
            {layout === 'side-by-side' && (
              <>
                {frontPanel && (
                  <VideoPanel
                    key={frontPanel.channel_no}
                    streamUrl={frontPanel.stream_url}
                    channelNo={frontPanel.channel_no}
                    label={frontPanel.label}
                    layout={layout}
                    health={frontPanel.health}
                    autoStart={isStreaming}
                    reconnectSignal={reconnectSignal}
                  />
                )}
                {rearPanel && (
                  <VideoPanel
                    key={rearPanel.channel_no}
                    streamUrl={rearPanel.stream_url}
                    channelNo={rearPanel.channel_no}
                    label={rearPanel.label}
                    layout={layout}
                    health={rearPanel.health}
                    autoStart={isStreaming}
                    reconnectSignal={reconnectSignal}
                  />
                )}
              </>
            )}

            {layout === 'front-focus' && frontPanel && (
              <>
                <VideoPanel
                  key={frontPanel.channel_no}
                  streamUrl={frontPanel.stream_url}
                  channelNo={frontPanel.channel_no}
                  label={frontPanel.label}
                  layout={layout}
                  health={frontPanel.health}
                  isFocused
                  autoStart={isStreaming}
                  reconnectSignal={reconnectSignal}
                />
                {rearPanel && (
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <VideoPanel
                      key={rearPanel.channel_no}
                      streamUrl={rearPanel.stream_url}
                      channelNo={rearPanel.channel_no}
                      label={rearPanel.label}
                      layout={layout}
                      health={rearPanel.health}
                      autoStart={isStreaming}
                      reconnectSignal={reconnectSignal}
                    />
                  </div>
                )}
              </>
            )}

            {layout === 'rear-focus' && rearPanel && (
              <>
                <VideoPanel
                  key={rearPanel.channel_no}
                  streamUrl={rearPanel.stream_url}
                  channelNo={rearPanel.channel_no}
                  label={rearPanel.label}
                  layout={layout}
                  health={rearPanel.health}
                  isFocused
                  autoStart={isStreaming}
                  reconnectSignal={reconnectSignal}
                />
                {frontPanel && frontPanel.channel_no !== rearPanel.channel_no && (
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <VideoPanel
                      key={frontPanel.channel_no}
                      streamUrl={frontPanel.stream_url}
                      channelNo={frontPanel.channel_no}
                      label={frontPanel.label}
                      layout={layout}
                      health={frontPanel.health}
                      autoStart={isStreaming}
                      reconnectSignal={reconnectSignal}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {selectedVehicle && deviceId && panels.length === 0 && !channelsLoading && (
          <div className="rounded-xl bg-white p-8 text-center text-slate-500 shadow-sm">
            No camera channels configured for this device.
          </div>
        )}

        {selectedVehicle && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="rounded-xl bg-white p-4 shadow-sm lg:col-span-2">
              <h3 className="mb-3 text-sm font-semibold text-slate-900">
                Current Location
              </h3>
              <MapContainer
                key={selectedVehicle.id}
                center={mapCenter}
                zoom={14}
                scrollWheelZoom={false}
                className="h-64 w-full rounded-lg"
                maxBounds={HYDERABAD_BOUNDS}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                {latest?.latitude && latest?.longitude && (
                  <Marker position={[latest.latitude, latest.longitude]}>
                    <Popup>{selectedVehicle.registration_no}</Popup>
                  </Marker>
                )}
              </MapContainer>
            </div>

            <div className="rounded-xl bg-white p-4 shadow-sm">
              <h3 className="mb-3 text-sm font-semibold text-slate-900">
                Vehicle Data
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <DataItem
                  label="Speed"
                  value={
                    latest?.speed_kmh !== null && latest?.speed_kmh !== undefined
                      ? `${latest.speed_kmh} km/h`
                      : '--'
                  }
                />
                <DataItem
                  label="Ignition"
                  value={
                    latest?.ignition_on === null ||
                    latest?.ignition_on === undefined
                      ? '--'
                      : latest.ignition_on
                        ? 'On'
                        : 'Off'
                  }
                />
                <DataItem
                  label="Heading"
                  value={
                    latest?.heading_deg !== null &&
                    latest?.heading_deg !== undefined
                      ? `${Math.round(latest.heading_deg)}°`
                      : '--'
                  }
                />
                <DataItem
                  label="Last Fix"
                  value={formatLastSeen(latest?.recorded_at)}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {isSaveModalOpen && selectedVehicle && deviceId && (
        <SaveVideoModal
          deviceId={deviceId}
          channels={channels}
          onClose={() => setIsSaveModalOpen(false)}
        />
      )}

      {isRecordingsModalOpen && (
        <RecordingsModal onClose={() => setIsRecordingsModalOpen(false)} />
      )}
    </div>
  );
}

function StatusItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function DataItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}
