import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import type { LatLngExpression } from 'leaflet';
import { Activity, Camera, Clock, Gauge, LayoutGrid, MapPinned, Radio, Satellite, Video as VideoIcon } from 'lucide-react';
import { useAllVehicles } from '../hooks/useAllVehicles';
import { useVideoChannels } from '../hooks/useVideoChannels';
import { startStreams } from '../services/video';
import VideoControls from '../components/video/VideoControls';
import VideoPanel from '../components/video/VideoPanel';
import SaveVideoModal from '../components/video/SaveVideoModal';
import RecordingsModal from '../components/video/RecordingsModal';
import { formatInIst } from '../utils/formatDate';
import { MAP_MIN_ZOOM, MAP_TILE_LAYER, WORLD_BOUNDS } from '../constants/map';
import type { DeviceChannelOut, DeviceHealth, VehicleStatus } from '../types';

type LayoutMode = 'side-by-side' | 'front-focus' | 'rear-focus';

const STREAM_READY_WAIT_MS = 1_500;
const STREAM_KEEPALIVE_INTERVAL_MS = 15_000;

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

function waitForStreamReady(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

function VideoMapController({
  center,
  vehicleId,
}: {
  center: LatLngExpression;
  vehicleId: number;
}) {
  const map = useMap();
  const lastVehicleIdRef = useRef<number | null>(null);

  useEffect(() => {
    const isSameVehicle = lastVehicleIdRef.current === vehicleId;
    lastVehicleIdRef.current = vehicleId;

    if (isSameVehicle) {
      map.panTo(center, { animate: true });
      return;
    }

    map.setView(center, 14, { animate: true });
  }, [center, map, vehicleId]);

  return null;
}

export default function VideoTelematics() {
  const [searchParams, setSearchParams] = useSearchParams();
  const focusedChannelNo = useMemo(() => {
    const raw = searchParams.get('channelNo');
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }, [searchParams]);
  const shouldAutostart = searchParams.get('autostart') === '1';
  const cameraSectionRef = useRef<HTMLDivElement | null>(null);
  const autostartKeyRef = useRef<string | null>(null);
  const {
    vehicles,
    isLoading: vehiclesLoading,
    error: vehiclesError,
  } = useAllVehicles();
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | null>(null);
  const [layout, setLayout] = useState<LayoutMode>('side-by-side');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
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

  const deviceId = selectedVehicle?.device_id ?? selectedVehicle?.latest?.device_id ?? null;
  const {
    channels,
    health,
    isLoading: channelsLoading,
    refetch: refetchVideoChannels,
  } = useVideoChannels(deviceId);

  const panels: PanelConfig[] = useMemo(() => {
    return channels.slice(0, 4).map((channel) => ({
      ...channel,
      health:
        health.find((h) => h.channel_no === channel.channel_no) ?? null,
    }));
  }, [channels, health]);

  const handleVehicleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const id = Number(event.target.value);
    setSelectedVehicleId(id);
    setIsStreaming(false);
    autostartKeyRef.current = null;
    setSearchParams({ vehicleId: String(id) });
  };

  const handleLayoutChange = (nextLayout: LayoutMode) => {
    setLayout(nextLayout);
    if (selectedVehicleId) {
      setSearchParams({ vehicleId: String(selectedVehicleId) });
    }
  };

  const handleStartCameras = async () => {
    setStreamError(null);

    if (!selectedVehicle) {
      setStreamError('Select a vehicle before starting cameras.');
      return;
    }

    if (!deviceId) {
      setStreamError('Selected vehicle has no assigned device. Add device serial/SIM and camera sources first.');
      return;
    }

    let currentChannels = channels;
    if (channelsLoading || currentChannels.length === 0) {
      currentChannels = await refetchVideoChannels();
    }

    if (currentChannels.length === 0) {
      setStreamError('No camera channels configured for this vehicle. Add a camera source in Edit Vehicle first.');
      return;
    }

    if (!currentChannels.some((channel) => channel.stream_url)) {
      setStreamError('Camera channels exist but no playback URLs are available. Check MediaMTX configuration.');
      return;
    }

    try {
      await startStreams(deviceId);
      await waitForStreamReady(STREAM_READY_WAIT_MS);
      await refetchVideoChannels();
      setIsStreaming(true);
      setReconnectSignal((prev) => prev + 1);
    } catch {
      setStreamError('Failed to request camera relays. Check the API, Redis, protocol-layer, and MediaMTX services.');
    }
  };
  const handleStopCameras = () => {
    setIsStreaming(false);
    setStreamError(null);
  };

  useEffect(() => {
    if (!isStreaming || !deviceId) return;

    let cancelled = false;
    const refreshRelays = async () => {
      try {
        await startStreams(deviceId);
        if (!cancelled) await refetchVideoChannels();
      } catch {
        // Active panels keep retrying; transient relay refresh failures should not stop the view.
      }
    };

    const intervalId = window.setInterval(() => {
      void refreshRelays();
    }, STREAM_KEEPALIVE_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [deviceId, isStreaming, refetchVideoChannels]);

  const handleReconnectView = () => setReconnectSignal((prev) => prev + 1);
  const handleSaveVideo = () => setIsSaveModalOpen(true);
  const handleSavedVideos = () => setIsRecordingsModalOpen(true);

  useEffect(() => {
    if (!shouldAutostart || isStreaming || !selectedVehicle || !deviceId || channelsLoading || channels.length === 0) return;
    if (focusedChannelNo && !channels.some((channel) => channel.channel_no === focusedChannelNo)) return;

    const key = `${selectedVehicle.id}:${deviceId}:${focusedChannelNo ?? 'all'}`;
    if (autostartKeyRef.current === key) return;
    autostartKeyRef.current = key;
    void handleStartCameras();
  }, [channels, channelsLoading, deviceId, focusedChannelNo, isStreaming, selectedVehicle, shouldAutostart]);

  useEffect(() => {
    if (!focusedChannelNo || panels.length === 0) return;
    window.setTimeout(() => {
      cameraSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  }, [focusedChannelNo, panels.length]);

  const cameraState = deriveCameraState(health);
  const configuredCameraCount = channels.length;
  const visibleCameraCount = panels.length;
  const cameraSummary = configuredCameraCount > 0
    ? `${cameraState} (${visibleCameraCount}/${configuredCameraCount} visible)`
    : cameraState;
  const latest = selectedVehicle?.latest;
  const mapCenter = useMemo<LatLngExpression>(
    () =>
      latest?.latitude != null && latest?.longitude != null
        ? [latest.latitude, latest.longitude]
        : DEFAULT_CENTER,
    [latest?.latitude, latest?.longitude]
  );

  const frontPanel = panels.find((p) =>
    p.label.toLowerCase().includes('front')
  ) ?? panels[0];
  const rearPanel = panels.find((p) =>
    p.label.toLowerCase().includes('rear')
  ) ?? panels[1];
  const focusedPanel = focusedChannelNo
    ? panels.find((panel) => panel.channel_no === focusedChannelNo) ?? null
    : null;
  const secondaryPanels = focusedPanel
    ? panels.filter((panel) => panel.channel_no !== focusedPanel.channel_no)
    : [];

  return (
    <div className="app-page app-animate-in">
      <div className="app-page-inner space-y-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="app-kicker mb-2">Camera operations</p>
            <h1 className="app-title">
              Video Telematics
            </h1>


          </div>

          <div className="app-card flex flex-col gap-3 p-3 xl:flex-row xl:items-center">
            <select
              value={selectedVehicleId ?? ''}
              onChange={handleVehicleChange}
              disabled={vehiclesLoading}
              className="app-select min-w-[12rem]"
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

            <div className="inline-flex rounded-lg p-1" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
              {LAYOUT_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleLayoutChange(option.value)}
                  className="rounded-lg px-3 py-2 text-xs font-semibold transition-colors"
                  style={{
                    backgroundColor: layout === option.value ? 'var(--bg-secondary)' : 'transparent',
                    color: layout === option.value ? 'var(--text-primary)' : 'var(--text-secondary)',
                    boxShadow: layout === option.value ? 'var(--shadow-sm)' : 'none',
                  }}
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
          <div className="rounded-lg p-4 text-sm font-semibold" style={{ backgroundColor: 'var(--danger-50)', color: 'var(--danger-text)' }}>
            Failed to load vehicles: {vehiclesError.message}
          </div>
        )}

        {streamError && (
          <div className="rounded-lg p-4 text-sm font-semibold" style={{ backgroundColor: 'var(--danger-50)', color: 'var(--danger-text)' }}>
            {streamError}
          </div>
        )}

        {selectedVehicle && (
          <div className="app-stagger grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatusItem icon={<VideoIcon className="h-4 w-4" />} label="Vehicle" value={selectedVehicle.registration_no} />
            <StatusItem icon={<Camera className="h-4 w-4" />} label="Cameras" value={cameraSummary} />
            <StatusItem
              icon={<Radio className="h-4 w-4" />}
              label="GPS"
              value={latest?.status ? STATUS_LABELS[latest.status] : '--'}
            />
            <StatusItem
              icon={<Clock className="h-4 w-4" />}
              label="Last Seen"
              value={formatLastSeen(latest?.received_at)}
            />
          </div>
        )}

        {!selectedVehicle && !vehiclesLoading && (
          <div className="app-card p-8 text-center text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
            No vehicle selected.
          </div>
        )}

        {selectedVehicle && !deviceId && (
          <div className="rounded-lg p-4 text-sm font-semibold" style={{ backgroundColor: 'var(--warning-100)', color: 'var(--warning-800)' }}>
            Selected vehicle has no assigned device.
          </div>
        )}

        {channelsLoading && deviceId && (
          <div className="app-card p-8 text-center text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
            Loading camera channels...
          </div>
        )}

        {panels.length > 0 && (
          <div ref={cameraSectionRef} className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  <LayoutGrid className="h-4 w-4" style={{ color: 'var(--accent-600)' }} />
                  Camera grid
                </p>
                <p className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                  {configuredCameraCount} configured, {visibleCameraCount} visible
                </p>
              </div>
              <span className="rounded-full px-3 py-1 text-xs font-semibold" style={{ backgroundColor: isStreaming ? 'var(--success-100)' : 'var(--bg-secondary)', color: isStreaming ? 'var(--success-800)' : 'var(--text-secondary)' }}>
                {isStreaming ? 'Relays requested' : 'Idle'}
              </span>
            </div>

            {focusedPanel ? (
              <div className="space-y-4">
                <VideoPanel
                  key={focusedPanel.channel_no}
                  streamUrl={focusedPanel.stream_url}
                  channelNo={focusedPanel.channel_no}
                  label={focusedPanel.label}
                  layout={layout}
                  health={focusedPanel.health}
                  isFocused
                  autoStart={isStreaming}
                  reconnectSignal={reconnectSignal}
                />
                {secondaryPanels.length > 0 && (
                  <div className="app-stagger grid grid-cols-1 gap-4 md:grid-cols-2">
                    {secondaryPanels.map((panel) => (
                      <VideoPanel
                        key={panel.channel_no}
                        streamUrl={panel.stream_url}
                        channelNo={panel.channel_no}
                        label={panel.label}
                        layout={layout}
                        health={panel.health}
                        autoStart={isStreaming}
                        reconnectSignal={reconnectSignal}
                      />
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div
                className={[
                  'grid gap-4',
                  layout === 'side-by-side' && panels.length > 1 ? 'grid-cols-1 xl:grid-cols-2' : 'grid-cols-1',
                ].join(' ')}
              >
                {layout === 'side-by-side' && (
                  <>
                    {panels.map((panel) => (
                      <VideoPanel
                        key={panel.channel_no}
                        streamUrl={panel.stream_url}
                        channelNo={panel.channel_no}
                        label={panel.label}
                        layout={layout}
                        health={panel.health}
                        autoStart={isStreaming}
                        reconnectSignal={reconnectSignal}
                      />
                    ))}
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
                      <div className="app-stagger grid grid-cols-1 gap-4 md:grid-cols-2">
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
                      <div className="app-stagger grid grid-cols-1 gap-4 md:grid-cols-2">
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
          </div>
        )}

        {selectedVehicle && deviceId && panels.length === 0 && !channelsLoading && (
          <div className="app-card p-8 text-center text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
            No camera channels configured for this device. Open Vehicles &gt; Edit and add a camera source first.
          </div>
        )}

        {selectedVehicle && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="app-card p-4 lg:col-span-2">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                <MapPinned className="h-4 w-4" style={{ color: 'var(--accent-600)' }} />
                Current Location
              </h3>
              <MapContainer
                key={selectedVehicle.id}
                center={mapCenter}
                zoom={14}
                scrollWheelZoom
                minZoom={MAP_MIN_ZOOM}
                worldCopyJump={false}
                maxBounds={WORLD_BOUNDS}
                maxBoundsViscosity={1}
                className="h-72 w-full rounded-lg"
              >
                <TileLayer
                  attribution={MAP_TILE_LAYER.attribution}
                  url={MAP_TILE_LAYER.url}
                  noWrap
                />
                <VideoMapController center={mapCenter} vehicleId={selectedVehicle.id} />
                {latest?.latitude != null && latest?.longitude != null && (
                  <Marker position={[latest.latitude, latest.longitude]}>
                    <Popup>{selectedVehicle.registration_no}</Popup>
                  </Marker>
                )}
              </MapContainer>
            </div>

            <div className="app-card p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                <Activity className="h-4 w-4" style={{ color: 'var(--accent-600)' }} />
                Vehicle Data
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <DataItem
                  icon={<Gauge className="h-3.5 w-3.5" />}
                  label="Speed"
                  value={
                    latest?.speed_kmh !== null && latest?.speed_kmh !== undefined
                      ? `${latest.speed_kmh} km/h`
                      : '--'
                  }
                />
                <DataItem
                  icon={<Satellite className="h-3.5 w-3.5" />}
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
                  icon={<MapPinned className="h-3.5 w-3.5" />}
                  label="Heading"
                  value={
                    latest?.heading_deg !== null &&
                    latest?.heading_deg !== undefined
                      ? `${Math.round(latest.heading_deg)} deg`
                      : '--'
                  }
                />
                <DataItem
                  icon={<Clock className="h-3.5 w-3.5" />}
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

function StatusItem({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="app-card app-hover-lift flex min-h-[5rem] items-center gap-3 p-4">
      <div className="app-icon-box">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="app-label truncate">{label}</p>
        <p className="app-value truncate text-sm">{value}</p>
      </div>
    </div>
  );
}

function DataItem({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="app-muted-tile p-3">
      <p className="app-label mb-1 flex items-center gap-1.5">
        {icon}
        {label}
      </p>
      <p className="app-value truncate text-sm">{value}</p>
    </div>
  );
}