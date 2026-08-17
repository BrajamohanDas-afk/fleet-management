import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import {
  AlertTriangle,
  BatteryMedium,
  CheckCircle2,
  CirclePause,
  Clock3,
  LocateFixed,
  MapPin,
  Navigation,
  Play,
  RefreshCcw,
  ShieldCheck,
  Signal,
  SignalZero,
} from 'lucide-react';
import type {
  TrackingLocationPayload,
  TrackingPageState,
  TrackingSession,
} from '../types';
import {
  getTrackingSession,
  reportTrackingPermissionDenied,
  sendTrackingHeartbeat,
  uploadTrackingLocation,
} from '../services/tracking';

const INSTALLATION_ID_KEY = 'fleet-tracking-installation-id';
const SEQUENCE_KEY_PREFIX = 'fleet-tracking-sequence:';
const QUEUE_KEY_PREFIX = 'fleet-tracking-location-queue:';
const MOVING_UPLOAD_MS = 5_000;
const STATIONARY_HEARTBEAT_MS = 30_000;
const DISTANCE_THRESHOLD_M = 10;
const STATIONARY_SPEED_KMH = 2;

function generateInstallationId(): string {
  if (crypto.randomUUID) {
    return crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'));
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex
    .slice(6, 8)
    .join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`;
}

function getInstallationId(): string {
  const existing = localStorage.getItem(INSTALLATION_ID_KEY);
  if (existing) return existing;

  const id = generateInstallationId();
  localStorage.setItem(INSTALLATION_ID_KEY, id);
  return id;
}

function storageToken(token: string, session?: TrackingSession): string {
  return session?.session_id ?? session?.id ?? token;
}

function sequenceKey(token: string, session?: TrackingSession): string {
  return `${SEQUENCE_KEY_PREFIX}${storageToken(token, session)}`;
}

function queueKey(token: string, session?: TrackingSession): string {
  return `${QUEUE_KEY_PREFIX}${storageToken(token, session)}`;
}

function readSequence(token: string, session?: TrackingSession): number {
  const value = Number(localStorage.getItem(sequenceKey(token, session)));
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function nextSequence(token: string, session?: TrackingSession): number {
  const next = readSequence(token, session) + 1;
  localStorage.setItem(sequenceKey(token, session), String(next));
  return next;
}

function readQueue(token: string, session?: TrackingSession): TrackingLocationPayload[] {
  const raw = localStorage.getItem(queueKey(token, session));
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(
  token: string,
  session: TrackingSession | undefined,
  payloads: TrackingLocationPayload[]
) {
  const key = queueKey(token, session);
  if (payloads.length === 0) {
    localStorage.removeItem(key);
    return;
  }

  localStorage.setItem(key, JSON.stringify(payloads));
}

function queueLocation(
  token: string,
  session: TrackingSession | undefined,
  payload: TrackingLocationPayload
) {
  writeQueue(token, session, [...readQueue(token, session), payload]);
}

function formatDateTime(value?: string | null): string {
  if (!value) return 'not set';
  return new Date(value).toLocaleString([], {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function sessionIsCompleted(session?: TrackingSession): boolean {
  return session?.status === 'COMPLETED' || Boolean(session?.completed_at);
}

function sessionLinkIssue(session?: TrackingSession): string | null {
  if (!session) return null;
  if (session.status === 'EXPIRED') return 'This tracking link has expired.';
  if (session.status === 'REVOKED' || session.revoked_at) {
    return 'This tracking link was revoked by the fleet operator.';
  }
  if (session.expires_at && new Date(session.expires_at).getTime() <= Date.now()) {
    return 'This tracking link has expired.';
  }
  return null;
}

function getVehicleLabel(session?: TrackingSession): string {
  return (
    session?.vehicle_label ??
    session?.registration_no ??
    session?.vehicle_code ??
    'Assigned vehicle'
  );
}

function getTripLabel(session?: TrackingSession): string {
  if (session?.trip_name) return session.trip_name;
  if (session?.origin && session?.destination) {
    return `${session.origin} to ${session.destination}`;
  }
  return 'Live trip';
}

function getErrorMessage(error: unknown): string {
  if (!isAxiosError(error)) {
    return 'Unable to validate this tracking link.';
  }

  const status = error.response?.status;
  if (status === 404) return 'This tracking link is invalid.';
  if (status === 410) return 'This tracking link has expired or was completed.';
  if (status === 401 || status === 403) {
    return 'This tracking link is not authorized or was revoked.';
  }
  return 'Unable to validate this tracking link right now.';
}

function isTerminalUploadError(error: unknown): boolean {
  if (!isAxiosError(error) || !error.response) return false;
  const status = error.response.status;
  return status === 400 || status === 401 || status === 403 || status === 404 || status === 410;
}

function uploadCompleted(status?: string): boolean {
  return status === 'completed';
}

function distanceMeters(a: TrackingLocationPayload, b: TrackingLocationPayload): number {
  const earthRadiusM = 6_371_000;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const deltaLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const deltaLng = ((b.longitude - a.longitude) * Math.PI) / 180;

  const haversine =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(deltaLng / 2) *
      Math.sin(deltaLng / 2);
  return earthRadiusM * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function speedKmh(payload: TrackingLocationPayload): number {
  return payload.speed == null ? 0 : payload.speed * 3.6;
}

function shouldUploadLocation(
  current: TrackingLocationPayload,
  lastUploaded: TrackingLocationPayload | null
): boolean {
  if (!lastUploaded) return true;

  const elapsedMs =
    new Date(current.captured_at).getTime() - new Date(lastUploaded.captured_at).getTime();
  const distanceM = distanceMeters(lastUploaded, current);
  const moving = speedKmh(current) >= STATIONARY_SPEED_KMH || distanceM >= DISTANCE_THRESHOLD_M;

  if (distanceM >= DISTANCE_THRESHOLD_M) return true;
  if (moving && elapsedMs >= MOVING_UPLOAD_MS) return true;
  return elapsedMs >= STATIONARY_HEARTBEAT_MS;
}

function buildPayload(
  position: GeolocationPosition,
  token: string,
  session: TrackingSession | undefined,
  installationId: string
): TrackingLocationPayload {
  return {
    session_token: token,
    installation_id: installationId,
    sequence: nextSequence(token, session),
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy: position.coords.accuracy,
    speed: position.coords.speed,
    heading: position.coords.heading,
    altitude: position.coords.altitude,
    captured_at: new Date(position.timestamp).toISOString(),
  };
}

function statusCopy(pageState: TrackingPageState, queuedCount: number) {
  if (pageState === 'TRACKING') {
    return {
      tone: 'bg-emerald-100 text-emerald-800',
      label: queuedCount > 0 ? `Tracking active - ${queuedCount} queued` : 'Tracking active',
      icon: Signal,
    };
  }
  if (pageState === 'OFFLINE') {
    return {
      tone: 'bg-amber-100 text-amber-900',
      label: `Offline - ${queuedCount} update${queuedCount === 1 ? '' : 's'} queued`,
      icon: SignalZero,
    };
  }
  if (pageState === 'PERMISSION_DENIED') {
    return {
      tone: 'bg-red-100 text-red-800',
      label: 'Location permission denied',
      icon: AlertTriangle,
    };
  }
  if (pageState === 'COMPLETED') {
    return {
      tone: 'bg-slate-200 text-slate-700',
      label: 'Trip completed',
      icon: CheckCircle2,
    };
  }
  if (pageState === 'PAUSED') {
    return {
      tone: 'bg-blue-100 text-blue-800',
      label: 'Tracking paused',
      icon: CirclePause,
    };
  }
  return {
    tone: 'bg-slate-200 text-slate-700',
    label: pageState === 'STARTING' ? 'Starting GPS' : 'Not started',
    icon: LocateFixed,
  };
}

export default function PublicTracking() {
  const { token = '' } = useParams();
  const [pageState, setPageState] = useState<TrackingPageState>('NOT_STARTED');
  const [message, setMessage] = useState<string | null>(null);
  const [queuedCount, setQueuedCount] = useState(0);
  const [lastUploadedAt, setLastUploadedAt] = useState<string | null>(null);
  const [lastAccuracy, setLastAccuracy] = useState<number | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const lastUploadedRef = useRef<TrackingLocationPayload | null>(null);
  const flushingRef = useRef(false);

  const {
    data: session,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['tracking-session', token],
    queryFn: () => getTrackingSession(token),
    enabled: Boolean(token),
    refetchInterval: pageState === 'TRACKING' || pageState === 'OFFLINE' ? 30_000 : false,
  });

  const linkIssue = useMemo(() => sessionLinkIssue(session), [session]);
  const permissionNotice =
    session?.status === 'PERMISSION_DENIED' && pageState === 'NOT_STARTED'
      ? 'Location permission was denied before. Enable location for this site in the browser, then tap Start tracking again.'
      : null;
  const status = statusCopy(pageState, queuedCount);
  const StatusIcon = status.icon;

  const refreshQueuedCount = useCallback(() => {
    setQueuedCount(readQueue(token, session).length);
  }, [session, token]);

  const stopWatch = useCallback(() => {
    if (watchIdRef.current == null) return;
    navigator.geolocation.clearWatch(watchIdRef.current);
    watchIdRef.current = null;
  }, []);

  const flushQueue = useCallback(async () => {
    if (!token || flushingRef.current) return;
    flushingRef.current = true;

    const queued = readQueue(token, session);
    const remaining = [...queued];

    try {
      while (remaining.length > 0) {
        const payload = remaining[0];
        const response = await uploadTrackingLocation(payload);
        lastUploadedRef.current = payload;
        setLastUploadedAt(payload.captured_at);
        if (uploadCompleted(response.status)) {
          stopWatch();
          setPageState('COMPLETED');
          setMessage('This trip is marked complete. Location sharing has stopped.');
          break;
        }
        remaining.shift();
        writeQueue(token, session, remaining);
        setQueuedCount(remaining.length);
      }

      if (navigator.onLine && pageState === 'OFFLINE') {
        setPageState('TRACKING');
        setMessage(null);
      }
    } catch {
      writeQueue(token, session, remaining);
      setQueuedCount(remaining.length);
      if (pageState === 'TRACKING') {
        setPageState('OFFLINE');
        setMessage('Updates are saved on this phone and will send when the connection returns.');
      }
    } finally {
      flushingRef.current = false;
    }
  }, [pageState, session, token]);

  const sendOrQueueLocation = useCallback(
    async (payload: TrackingLocationPayload) => {
      try {
        const response = await uploadTrackingLocation(payload);
        lastUploadedRef.current = payload;
        setLastUploadedAt(payload.captured_at);
        setLastAccuracy(payload.accuracy);
        if (uploadCompleted(response.status)) {
          stopWatch();
          setPageState('COMPLETED');
          setMessage('This trip is marked complete. Location sharing has stopped.');
          return;
        }
        if (navigator.onLine) {
          setPageState('TRACKING');
          setMessage(null);
        }
      } catch (uploadError) {
        if (isTerminalUploadError(uploadError)) {
          stopWatch();
          void refetch();
          setMessage(getErrorMessage(uploadError));
          return;
        }

        queueLocation(token, session, payload);
        refreshQueuedCount();
        setPageState('OFFLINE');
        setMessage('Updates are saved on this phone and will send when the connection returns.');
      }
    },
    [refetch, refreshQueuedCount, session, stopWatch, token]
  );

  const handlePosition = useCallback(
    (position: GeolocationPosition) => {
      const installationId = getInstallationId();
      const payload = buildPayload(position, token, session, installationId);
      setLastAccuracy(payload.accuracy);

      if (!shouldUploadLocation(payload, lastUploadedRef.current)) {
        return;
      }

      void sendOrQueueLocation(payload);
    },
    [sendOrQueueLocation, session, token]
  );

  const handleGeoError = useCallback(
    (geoError: GeolocationPositionError) => {
      stopWatch();

      if (geoError.code === geoError.PERMISSION_DENIED) {
        const installationId = getInstallationId();
        setPageState('PERMISSION_DENIED');
        setMessage('Location access is blocked. Enable location permission for this site, then start again.');
        void reportTrackingPermissionDenied({
          session_token: token,
          installation_id: installationId,
          reason: geoError.message || 'permission denied',
          denied_at: new Date().toISOString(),
        }).catch(() => undefined);
        return;
      }

      setPageState('NOT_STARTED');
      setMessage(
        geoError.code === geoError.POSITION_UNAVAILABLE
          ? 'GPS is unavailable right now. Move to an open area and try again.'
          : 'GPS did not respond in time. Check location services and try again.'
      );
    },
    [stopWatch, token]
  );

  const startTracking = useCallback(() => {
    setMessage(null);

    if (!token || !session || linkIssue || sessionIsCompleted(session)) {
      return;
    }

    if (!('geolocation' in navigator)) {
      setPageState('NOT_STARTED');
      setMessage('GPS is not available in this browser. Open the link in Chrome, Safari, or another browser with location support.');
      return;
    }

    if (!window.isSecureContext) {
      setPageState('NOT_STARTED');
      setMessage('Phone GPS requires a secure HTTPS link. Use an HTTPS tunnel or deployment for real phone tracking.');
      return;
    }

    setPageState(navigator.onLine ? 'STARTING' : 'OFFLINE');
    getInstallationId();
    refreshQueuedCount();

    watchIdRef.current = navigator.geolocation.watchPosition(
      handlePosition,
      handleGeoError,
      {
        enableHighAccuracy: true,
        maximumAge: 5_000,
        timeout: 20_000,
      }
    );
  }, [handleGeoError, handlePosition, linkIssue, refreshQueuedCount, session, token]);

  const pauseTracking = useCallback(() => {
    stopWatch();
    setPageState('PAUSED');
    setMessage('Tracking is paused on this phone. Resume before continuing the trip.');
  }, [stopWatch]);

  useEffect(() => {
    refreshQueuedCount();
  }, [refreshQueuedCount]);

  useEffect(() => {
    if (sessionIsCompleted(session)) {
      stopWatch();
      setPageState('COMPLETED');
      setMessage('This trip is marked complete. Location sharing has stopped.');
    }
  }, [session, stopWatch]);

  useEffect(() => {
    const handleOnline = () => {
      void flushQueue();
      if (pageState === 'OFFLINE') {
        setPageState('TRACKING');
      }
    };
    const handleOffline = () => {
      if (pageState === 'TRACKING' || pageState === 'STARTING') {
        setPageState('OFFLINE');
        setMessage('No internet connection. New GPS updates will be queued on this phone.');
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [flushQueue, pageState]);

  useEffect(() => {
    if (pageState !== 'TRACKING' && pageState !== 'OFFLINE') return;

    const interval = window.setInterval(() => {
      void flushQueue();
    }, 10_000);

    return () => window.clearInterval(interval);
  }, [flushQueue, pageState]);

  useEffect(() => {
    if (pageState !== 'TRACKING' && pageState !== 'OFFLINE') return;

    const interval = window.setInterval(() => {
      const installationId = getInstallationId();
      void sendTrackingHeartbeat({
        session_token: token,
        installation_id: installationId,
        last_sequence: readSequence(token, session),
        sent_at: new Date().toISOString(),
      }).catch(() => {
        setPageState('OFFLINE');
        setMessage('Connection is offline. GPS points remain saved locally.');
      });
    }, STATIONARY_HEARTBEAT_MS);

    return () => window.clearInterval(interval);
  }, [pageState, session, token]);

  useEffect(() => {
    return () => {
      stopWatch();
    };
  }, [stopWatch]);

  const startDisabled =
    isLoading ||
    Boolean(error) ||
    Boolean(linkIssue) ||
    !session ||
    sessionIsCompleted(session) ||
    pageState === 'STARTING' ||
    pageState === 'TRACKING' ||
    pageState === 'OFFLINE';

  const primaryButtonLabel = pageState === 'PAUSED' ? 'Resume tracking' : 'Start tracking';

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-5 py-6 sm:justify-center">
        <section className="flex min-h-[calc(100vh-3rem)] flex-col justify-between rounded-[2rem] border border-white/10 bg-slate-900 shadow-2xl shadow-slate-950/40">
          <div className="space-y-6 p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-sky-200">
                <Navigation className="h-4 w-4" />
                Live tracking
              </div>
              <div className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${status.tone}`}>
                <StatusIcon className="h-3.5 w-3.5" />
                {status.label}
              </div>
            </div>

            <div className="rounded-3xl border border-sky-300/20 bg-sky-200/10 p-4">
              <div className="mb-4 flex h-28 items-center justify-center rounded-2xl bg-slate-950/70">
                <div className="relative h-16 w-16">
                  <span className="absolute inset-0 rounded-full border border-sky-300/30" />
                  <span className="absolute inset-3 rounded-full border border-emerald-300/40" />
                  <span className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-300 shadow-[0_0_28px_rgba(110,231,183,0.9)]" />
                  <span className="absolute left-1/2 top-0 h-8 w-px -translate-x-1/2 bg-sky-200/70" />
                </div>
              </div>

              <h1 className="text-3xl font-bold leading-tight text-white">
                Share this phone's GPS for the trip
              </h1>
              <p className="mt-3 text-sm leading-6 text-slate-300">
                Your live location is sent to the fleet operator only after you start tracking.
              </p>
            </div>

            <div className="grid gap-3">
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <div className="flex items-center gap-3">
                  <MapPin className="h-5 w-5 text-sky-200" />
                  <div>
                    <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Vehicle</p>
                    <p className="text-base font-semibold text-white">{getVehicleLabel(session)}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <div className="flex items-center gap-3">
                  <Clock3 className="h-5 w-5 text-emerald-200" />
                  <div>
                    <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Trip</p>
                    <p className="text-base font-semibold text-white">{getTripLabel(session)}</p>
                    <p className="text-xs text-slate-400">Link expires {formatDateTime(session?.expires_at)}</p>
                  </div>
                </div>
              </div>
            </div>

            {(isLoading || error || linkIssue || message || permissionNotice || sessionIsCompleted(session)) && (
              <div
                className={[
                  'rounded-2xl border p-4 text-sm leading-6',
                  error || linkIssue || permissionNotice || pageState === 'PERMISSION_DENIED'
                    ? 'border-red-300/30 bg-red-500/10 text-red-100'
                    : 'border-sky-300/20 bg-sky-500/10 text-sky-100',
                ].join(' ')}
              >
                {isLoading && 'Checking this tracking link...'}
                {error && getErrorMessage(error)}
                {!error && linkIssue}
                {!error && !linkIssue && message}
                {!error && !linkIssue && !message && permissionNotice}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <BatteryMedium className="mb-3 h-5 w-5 text-slate-300" />
                <p className="text-xs uppercase tracking-[0.12em] text-slate-400">GPS accuracy</p>
                <p className="text-lg font-bold text-white">
                  {lastAccuracy == null ? '--' : `${Math.round(lastAccuracy)} m`}
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <ShieldCheck className="mb-3 h-5 w-5 text-slate-300" />
                <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Last upload</p>
                <p className="text-lg font-bold text-white">
                  {lastUploadedAt ? formatDateTime(lastUploadedAt) : '--'}
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-3 border-t border-white/10 p-5">
            {pageState === 'TRACKING' || pageState === 'OFFLINE' ? (
              <button
                type="button"
                onClick={pauseTracking}
                className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-base font-bold text-white transition hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-slate-900"
              >
                <CirclePause className="h-5 w-5" />
                Pause tracking
              </button>
            ) : (
              <button
                type="button"
                onClick={startTracking}
                disabled={startDisabled}
                className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-300 px-4 py-3 text-base font-bold text-slate-950 transition hover:bg-emerald-200 focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:ring-offset-2 focus:ring-offset-slate-900 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
              >
                <Play className="h-5 w-5" />
                {pageState === 'STARTING' ? 'Starting...' : primaryButtonLabel}
              </button>
            )}

            <button
              type="button"
              onClick={() => void refetch()}
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold text-slate-300 transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-slate-900"
            >
              <RefreshCcw className="h-4 w-4" />
              Refresh link status
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
