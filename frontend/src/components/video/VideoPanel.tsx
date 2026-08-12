import {
  CameraOff,
  Maximize,
  RefreshCw,
  RotateCcw,
  Play,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useVideoPanelState } from '../../hooks/useVideoPanelState';
import ChannelBadge from './ChannelBadge';
import type { DeviceHealth } from '../../types';

type LayoutMode = 'side-by-side' | 'front-focus' | 'rear-focus';

interface VideoPanelProps {
  streamUrl: string;
  channelNo: number;
  label: string;
  layout: LayoutMode;
  health: DeviceHealth | null;
  isFocused?: boolean;
  autoStart?: boolean;
  reconnectSignal?: number;
}

const CONNECTING_TIMEOUT_MS = 10_000;

function formatAge(lastFrameAt: Date | null): string {
  if (!lastFrameAt) return 'unknown';
  const seconds = Math.floor((Date.now() - lastFrameAt.getTime()) / 1000);
  return `${seconds}s ago`;
}

export default function VideoPanel({
  streamUrl,
  channelNo,
  label,
  layout,
  health,
  isFocused = false,
  autoStart = false,
  reconnectSignal = 0,
}: VideoPanelProps) {
  const {
    state,
    isRegistered,
    lastFrameAt,
    connectionKey,
    start,
    stop,
    retry,
    updateHealth,
    onStreamReady,
    onStreamError,
  } = useVideoPanelState();
  const videoRef = useRef<HTMLVideoElement>(null);
  const connectingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    updateHealth(health);
  }, [health, updateHealth]);

  useEffect(() => {
    if (autoStart) start();
    else stop();
  }, [autoStart, start, stop]);

  const didMountRef = useRef(false);
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    if (reconnectSignal > 0) retry();
  }, [reconnectSignal, retry]);

  useEffect(() => {
    if (state !== 'connecting') {
      if (connectingTimeoutRef.current) {
        clearTimeout(connectingTimeoutRef.current);
        connectingTimeoutRef.current = null;
      }
      return;
    }

    connectingTimeoutRef.current = setTimeout(() => {
      onStreamError();
    }, CONNECTING_TIMEOUT_MS);

    return () => {
      if (connectingTimeoutRef.current) {
        clearTimeout(connectingTimeoutRef.current);
        connectingTimeoutRef.current = null;
      }
    };
  }, [state, connectionKey, onStreamError]);

  useEffect(() => {
    return () => {
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.src = '';
        videoRef.current.load();
      }
    };
  }, []);

  const handleFullscreen = () => {
    if (videoRef.current?.requestFullscreen) {
      void videoRef.current.requestFullscreen();
    }
  };

  const handleRefresh = () => {
    stop();
    start();
  };

  const containerHeight = isFocused
    ? 'h-[28rem]'
    : layout === 'side-by-side'
      ? 'h-80'
      : 'h-72';

  if (!isRegistered) {
    return (
      <div
        className={[
          'relative flex flex-col items-center justify-center rounded-xl bg-slate-900',
          containerHeight,
        ].join(' ')}
      >
        <div className="text-center">
          <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-amber-500" />
          <p className="text-sm font-medium text-white">Video limit reached</p>
          <p className="mt-1 text-xs text-slate-400">
            Stop another stream to start {label}.
          </p>
        </div>
      </div>
    );
  }

  const showVideo = state === 'live' || state === 'degraded';

  return (
    <div
      className={[
        'relative overflow-hidden rounded-xl bg-slate-900 shadow-sm',
        containerHeight,
      ].join(' ')}
    >
      <div className="absolute left-3 top-3 z-10">
        <ChannelBadge label={label} state={state} />
      </div>

      <div className="absolute right-3 top-3 z-10 flex items-center gap-2">
        <button
          type="button"
          onClick={handleRefresh}
          title="Refresh stream"
          className="rounded-lg bg-slate-800/80 p-1.5 text-white hover:bg-slate-700"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={handleFullscreen}
          title="Fullscreen"
          className="rounded-lg bg-slate-800/80 p-1.5 text-white hover:bg-slate-700"
        >
          <Maximize className="h-4 w-4" />
        </button>
      </div>

      {state === 'idle' && (
        <div className="flex h-full flex-col items-center justify-center">
          <CameraOff className="mb-3 h-12 w-12 text-slate-500" />
          <p className="mb-4 text-sm text-slate-400">Stream stopped</p>
          <button
            type="button"
            onClick={start}
            className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
          >
            <Play className="h-4 w-4" />
            Start Stream
          </button>
        </div>
      )}

      {state === 'connecting' && (
        <div className="flex h-full flex-col items-center justify-center">
          <Loader2 className="mb-3 h-10 w-10 animate-spin text-primary-400" />
          <p className="text-sm font-medium text-white">Connecting…</p>
        </div>
      )}

      {showVideo && (
        <div className="relative h-full w-full">
          {/*
            TODO: Replace with a proper WHEP/WebRTC player for production.
            For v1 we use a plain <video> element which works when the backend
            exposes an HLS or direct media URL. MediaMTX WHEP URLs require an
            RTCPeerConnection handshake.
          */}
          <video
            key={connectionKey}
            ref={videoRef}
            src={streamUrl}
            autoPlay
            muted
            playsInline
            className="h-full w-full object-cover"
            onLoadedData={onStreamReady}
            onError={onStreamError}
          />
          {state === 'degraded' && (
            <div className="absolute bottom-3 left-3 z-10 rounded-lg bg-amber-500/90 px-3 py-1.5 text-xs font-semibold text-white">
              Last frame {formatAge(lastFrameAt)}
            </div>
          )}
        </div>
      )}

      {state === 'reconnecting' && (
        <div className="flex h-full flex-col items-center justify-center px-6 text-center">
          <CameraOff className="mb-3 h-10 w-10 text-orange-400" />
          <p className="text-sm font-medium text-white">Connection lost</p>
          <p className="mb-4 text-xs text-slate-400">
            Last frame {formatAge(lastFrameAt)}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={start}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white hover:bg-primary-700"
            >
              <Play className="h-4 w-4" />
              Start Stream
            </button>
            <button
              type="button"
              onClick={retry}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-700 px-3 py-2 text-sm font-medium text-white hover:bg-slate-600"
            >
              <RotateCcw className="h-4 w-4" />
              Reconnect
            </button>
          </div>
        </div>
      )}

      {state === 'offline' && (
        <div className="flex h-full flex-col items-center justify-center">
          <CameraOff className="mb-3 h-10 w-10 text-red-500" />
          <p className="mb-1 text-sm font-medium text-white">Camera offline</p>
          <p className="mb-4 text-xs text-slate-400">
            Channel {channelNo} is not reachable.
          </p>
          <button
            type="button"
            onClick={retry}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
          >
            <RotateCcw className="h-4 w-4" />
            Retry
          </button>
        </div>
      )}
    </div>
  );
}
